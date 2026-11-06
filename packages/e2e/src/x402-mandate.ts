/**
 * Raise the spend mandate an x402 agent is held to.
 *
 * A mandate is an ordinary purchase order on the gate whose spec is the URL of
 * the endpoint the agent may pay, whose payee is the account that endpoint may
 * be paid at, and whose quantity is the number of calls a person has agreed to.
 * It is raised by one person and the call volume is signed for by another, so
 * the agent's budget carries the same separation of duties as any other order.
 *
 *   set -a; source .env.local; set +a
 *   RESOURCE_URL=http://localhost:3000/api/x402/resource \
 *     node packages/e2e/src/x402-mandate.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createPublicClient, createWalletClient, keccak256, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Bytes32 } from "@zowall/gate-core";
import { createActionHash, receiptActionHash, signAttestation } from "@zowall/world";
import { payeeAddress } from "@zowall/x402";

import { GATE_ABI } from "./abi.ts";
import { explorerTx, transport, whitechainSepolia } from "./chain.ts";

const need = (n: string) => {
  const v = process.env[n];
  if (!v) throw new Error(`${n} is not set`);
  return v;
};

const GATE = need("GATE_ADDRESS") as `0x${string}`;
const CHAIN_ID = Number(process.env["EVM_CHAIN_ID"] ?? 1874);
const RESOURCE = process.env["RESOURCE_URL"] ?? "http://localhost:3000/api/x402/resource";
const CALLS = BigInt(process.env["MANDATE_CALLS"] ?? "20");
/** Atomic units of the quoted asset per call. For HBAR these are tinybars. */
const PRICE = BigInt(process.env["MANDATE_PRICE"] ?? "10000");
const PAY_TO = need("X402_PAY_TO");

const buyer = privateKeyToAccount(need("PRIVATE_KEY") as `0x${string}`);
const vendor = privateKeyToAccount(need("VENDOR_PRIVATE_KEY") as `0x${string}`);
const pub = createPublicClient({ chain: whitechainSepolia, transport: transport() });
const wallet = createWalletClient({ account: buyer, chain: whitechainSepolia, transport: transport() });

// Two real, World ID verified people, read from the enrolment registry the app
// writes. The creator and the receiver must be different humans.
const people = JSON.parse(
  readFileSync(resolve(process.cwd(), "apps/web/.data/enrollments.json"), "utf8"),
) as Array<{ personId: Bytes32; label: string }>;
const creator = people[0];
const receiver = people[1];
if (!creator || !receiver) throw new Error("need two enrolled people; verify them at /enroll first");

const keys = need("ATTESTOR_PRIVATE_KEYS").split(",") as `0x${string}`[];
const threshold = Number(process.env["ATTESTOR_THRESHOLD"] ?? "1");

const attest = (personId: Bytes32, role: "Creator" | "Receiver", poId: bigint, actionHash: Bytes32) =>
  signAttestation(
    { personId, role, poId, actionHash },
    { privateKeys: keys, threshold, chainId: CHAIN_ID, gateAddress: GATE, ttlSeconds: 900 },
  );

const terms = {
  vendor: vendor.address,
  payee: payeeAddress(PAY_TO),
  specHash: keccak256(toHex(RESOURCE)),
  qty: CALLS,
  unitPrice: PRICE,
  priceTolBps: 500,
  qtyTolBps: 0,
  expiry: BigInt(Math.floor(Date.now() / 1000) + 7 * 86_400),
} as const;

const poId = (await pub.readContract({ address: GATE, abi: GATE_ABI, functionName: "nextPoId" })) as bigint;

console.log(`mandate for ${RESOURCE}`);
console.log(`  payee     ${PAY_TO}  =  ${terms.payee}`);
console.log(`  ${CALLS} calls at ${PRICE} atomic units, 5% tolerance`);
console.log(`  raised by ${creator.label}, signed for by ${receiver.label}\n`);

const h1 = await wallet.writeContract({
  address: GATE,
  abi: GATE_ABI,
  functionName: "createPO",
  args: [terms, await attest(creator.personId, "Creator", 0n, createActionHash(terms))],
});
await pub.waitForTransactionReceipt({ hash: h1 });
console.log(`order #${poId} raised\n  ${explorerTx(h1)}`);

const deliverable = keccak256(toHex(`x402 calls authorised: ${RESOURCE}`));
const h2 = await wallet.writeContract({
  address: GATE,
  abi: GATE_ABI,
  functionName: "attestReceipt",
  args: [
    poId,
    CALLS,
    deliverable,
    await attest(receiver.personId, "Receiver", poId, receiptActionHash(poId, CALLS, deliverable)),
  ],
});
await pub.waitForTransactionReceipt({ hash: h2 });
console.log(`${CALLS} calls signed for\n  ${explorerTx(h2)}`);
