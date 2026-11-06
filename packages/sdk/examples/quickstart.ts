/**
 * The agent's side of a payment, end to end, in one file.
 *
 * An order exists and a different person has signed for the delivery (both are
 * done in the workspace). This is what the paying agent does next:
 *
 *   set -a; source .env.local; set +a
 *   PO_ID=5 node packages/sdk/examples/quickstart.ts
 *
 * It asks the gate what would happen, then pays. A refusal is an answer, not an
 * exception, so the script reads it rather than catching it.
 */

import { createPublicClient, createWalletClient, defineChain, encodeAbiParameters, http, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { GATE_ABI, createGate, signInvoice, type Invoice } from "../src/index.ts";

const need = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
};

const gateAddress = need("GATE_ADDRESS") as `0x${string}`;
const chainId = Number(process.env["EVM_CHAIN_ID"] ?? 1874);
const poId = BigInt(need("PO_ID"));

// 1. The chain, and the two wallets. The agent holds its own key and sends the
//    transaction. The vendor holds a different key and signs the invoice.
const chain = defineChain({
  id: chainId,
  name: "Whitechain Sepolia",
  nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 },
  rpcUrls: { default: { http: [process.env["EVM_RPC_URL"] ?? "https://rpc.testnet.whitechain.io"] } },
});
const transport = http(undefined, { retryCount: 6, retryDelay: 800 });
const publicClient = createPublicClient({ chain, transport });
const agent = createWalletClient({ account: privateKeyToAccount(need("PRIVATE_KEY") as `0x${string}`), chain, transport });

// 2. The gate client.
const gate = createGate({ gateAddress, publicClient, walletClient: agent });

// 3. Read the order, so the invoice quotes what was agreed.
const po = (await publicClient.readContract({
  address: gateAddress,
  abi: GATE_ABI,
  functionName: "getPO",
  args: [poId],
})) as { vendor: `0x${string}`; payee: `0x${string}`; unitPrice: bigint; qty: bigint; invoicedQty: bigint; received: bigint };

const qty = BigInt(process.env["QTY"] ?? po.received - po.invoicedQty);
const nonce = BigInt(Date.now());

const invoice: Invoice = {
  poId,
  vendor: po.vendor,
  payee: po.payee,
  qty,
  unitPrice: po.unitPrice,
  invoiceHash: keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint128" }, { type: "uint128" }, { type: "address" }, { type: "uint256" }],
      [poId, qty, po.unitPrice, po.payee, nonce],
    ),
  ),
  nonce,
  deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
};

// 4. The vendor signs. In production the vendor does this and sends you the
//    invoice and the signature; here one script plays both parts.
const signature = await signInvoice(invoice, {
  privateKey: need("VENDOR_PRIVATE_KEY") as `0x${string}`,
  chainId,
  gateAddress,
});

// 5. Ask first. This changes nothing and costs no gas.
const preview = await gate.preview(invoice, signature);
console.log(`preview  ${preview.outcome}  ${preview.codes.join(", ") || "clean"}`);
console.log(`         ${preview.explain()}`);

// 6. Pay. PAID moves USDT in this transaction, HELD parks it for a third person,
//    REJECTED moves nothing. None of them throws.
const result = await gate.pay(invoice, signature);
console.log(`\nresult   ${result.outcome}  ${result.codes.join(", ") || "clean"}`);
console.log(`         ${result.explain()}`);
if (result.txHash) console.log(`         https://explorer.testnet.whitechain.io/tx/${result.txHash}`);
