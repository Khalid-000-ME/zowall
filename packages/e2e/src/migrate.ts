/**
 * Move a vault from a superseded gate to a new one.
 *
 * There is no withdraw function, deliberately: a vault the operator can empty
 * is not a reservation, and the vendor's whole reason to trust the encumbrance
 * is that nobody can take it back. The cost of that choice is that a redeploy
 * cannot simply move the money - it has to leave the only way funds ever
 * leave, through a purchase order that pays out.
 *
 * So this raises a PO on the old gate with itself as payee, signs for the
 * delivery, invoices it, and forwards the proceeds. Every step is a real
 * decision the old gate approved, which is the point.
 *
 *   OLD_GATE=0x... node packages/e2e/src/migrate.ts
 *   OLD_GATE=0x... OPEN_POS=1,2 node packages/e2e/src/migrate.ts   # cancel first
 */

import { createPublicClient, createWalletClient, encodeAbiParameters, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { formatUsdt, type Bytes32 } from "@zowall/gate-core";
import { ROLE_CODE, type Role } from "@zowall/world";

import { ERC20_ABI, GATE_ABI } from "./abi.ts";
import { explorerTx, transport, whitechainSepolia } from "./chain.ts";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

const OLD = env("OLD_GATE") as `0x${string}`;
const NEW = env("GATE_ADDRESS") as `0x${string}`;
const USDT = env("USDT_ADDRESS") as `0x${string}`;
const buyer = privateKeyToAccount(env("PRIVATE_KEY") as `0x${string}`);
const attestor = privateKeyToAccount(env("ATTESTOR_PRIVATE_KEY") as `0x${string}`);

const ALICE = `0x${"a1".repeat(32)}` as Bytes32;
const BOB = `0x${"b2".repeat(32)}` as Bytes32;

if (OLD.toLowerCase() === NEW.toLowerCase()) {
  throw new Error("OLD_GATE and GATE_ADDRESS are the same contract");
}

const pub = createPublicClient({ chain: whitechainSepolia, transport: transport() });
const wallet = createWalletClient({
  account: buyer,
  chain: whitechainSepolia,
  transport: transport(),
});

let nonce = BigInt(Date.now());

/** Attestations are domain-separated per contract, so this signs for OLD. */
async function attest(personId: Bytes32, role: Role, poId: bigint) {
  const message = {
    personId,
    role: ROLE_CODE[role],
    expiry: BigInt(Math.floor(Date.now() / 1000) + 900),
    poId,
    nonce: ++nonce,
  };
  const sig = await attestor.signTypedData({
    domain: { name: "Zowall", version: "1", chainId: 1874, verifyingContract: OLD },
    types: {
      Attestation: [
        { name: "personId", type: "bytes32" },
        { name: "role", type: "uint8" },
        { name: "expiry", type: "uint64" },
        { name: "poId", type: "uint256" },
        { name: "nonce", type: "uint256" },
      ],
    },
    primaryType: "Attestation",
    message,
  });
  return { ...message, sig };
}

const balance = (who: `0x${string}`) =>
  pub.readContract({ address: USDT, abi: ERC20_ABI, functionName: "balanceOf", args: [who] });

const free = () =>
  pub.readContract({ address: OLD, abi: GATE_ABI, functionName: "unencumberedBalance" });

async function tx(label: string, request: Parameters<typeof wallet.writeContract>[0]) {
  const hash = await wallet.writeContract(request);
  await pub.waitForTransactionReceipt({ hash });
  process.stdout.write(`  ${label}\n    ${explorerTx(hash)}\n`);
}

const line = (s = "") => process.stdout.write(`${s}\n`);

line(`old gate ${OLD}`);
line(`new gate ${NEW}`);
line(`holds    ${formatUsdt(await balance(OLD))} USDT`);
line(`free     ${formatUsdt(await free())} USDT`);
line("");

// Reservations block the drain, so release them first. Only the creator can.
for (const po of (process.env["OPEN_POS"] ?? "").split(",").filter(Boolean).map(BigInt)) {
  await tx(`cancelPO #${po}`, {
    address: OLD,
    abi: GATE_ABI,
    functionName: "cancelPO",
    args: [po, await attest(ALICE, "Creator", po)],
    chain: whitechainSepolia,
    account: buyer,
  });
}

const UNIT = 1_000_000n;
const qty = (await free()) / UNIT;
if (qty === 0n) {
  line("nothing recoverable in whole units");
  process.exit(0);
}

const poId = await pub.readContract({ address: OLD, abi: GATE_ABI, functionName: "nextPoId" });
line(`\nrecovering ${qty} USDT through PO #${poId}\n`);

await tx("createPO - payee is us", {
  address: OLD,
  abi: GATE_ABI,
  functionName: "createPO",
  args: [
    {
      vendor: buyer.address,
      payee: buyer.address,
      specHash: keccak256(toHex("vault migration")),
      qty,
      unitPrice: UNIT,
      priceTolBps: 0,
      qtyTolBps: 0,
      expiry: BigInt(Math.floor(Date.now() / 1000) + 3600),
    },
    await attest(ALICE, "Creator", 0n),
  ],
  chain: whitechainSepolia,
  account: buyer,
});

await tx("attestReceipt - a second human signs", {
  address: OLD,
  abi: GATE_ABI,
  functionName: "attestReceipt",
  args: [poId, qty, keccak256(toHex("vault migration")), await attest(BOB, "Receiver", poId)],
  chain: whitechainSepolia,
  account: buyer,
});

const invoice = {
  poId,
  vendor: buyer.address,
  payee: buyer.address,
  qty,
  unitPrice: UNIT,
  invoiceHash: keccak256(
    encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [poId, BigInt(Date.now())]),
  ),
  nonce: 1n,
  deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
};

const sig = await buyer.signTypedData({
  domain: { name: "Zowall", version: "1", chainId: 1874, verifyingContract: OLD },
  types: {
    Invoice: [
      { name: "poId", type: "uint256" },
      { name: "vendor", type: "address" },
      { name: "payee", type: "address" },
      { name: "qty", type: "uint128" },
      { name: "unitPrice", type: "uint128" },
      { name: "invoiceHash", type: "bytes32" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint64" },
    ],
  },
  primaryType: "Invoice",
  message: invoice,
});

const before = await balance(buyer.address);
await tx("submitInvoice - the old gate pays out", {
  address: OLD,
  abi: GATE_ABI,
  functionName: "submitInvoice",
  args: [invoice, sig],
  chain: whitechainSepolia,
  account: buyer,
});

const recovered = (await balance(buyer.address)) - before;
line(`\n  recovered ${formatUsdt(recovered)} USDT`);

if (recovered > 0n) {
  await tx(`forwarding to the new gate`, {
    address: USDT,
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [NEW, recovered],
    chain: whitechainSepolia,
    account: buyer,
  });
}

line("");
line(`old gate left ${formatUsdt(await balance(OLD))} USDT`);
line(`new gate has  ${formatUsdt(await balance(NEW))} USDT`);
