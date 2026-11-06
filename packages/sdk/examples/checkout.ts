/**
 * The merchant's side of a hosted checkout.
 *
 * An order exists, a different person has signed for the delivery, and the vendor
 * (the merchant) signs an invoice for it. Instead of handing a buyer a signature,
 * the merchant's server asks the gateway for a checkout session and redirects the
 * buyer to the URL it returns.
 *
 *   set -a; source .env.local; set +a
 *   PO_ID=<order id> QTY=<units> GATEWAY=http://localhost:3000 \
 *     node packages/sdk/examples/checkout.ts
 */

import { createPublicClient, defineChain, encodeAbiParameters, http, keccak256 } from "viem";

import { GATE_ABI, createCheckoutSession, signInvoice, type Invoice } from "../src/index.ts";

const need = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
};

const gateAddress = need("GATE_ADDRESS") as `0x${string}`;
const chainId = Number(process.env["EVM_CHAIN_ID"] ?? 1874);
const poId = BigInt(need("PO_ID"));
const gateway = process.env["GATEWAY"] ?? "http://localhost:3000";

const chain = defineChain({
  id: chainId,
  name: "Whitechain Sepolia",
  nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 },
  rpcUrls: { default: { http: [process.env["EVM_RPC_URL"] ?? "https://rpc.testnet.whitechain.io"] } },
});
const publicClient = createPublicClient({ chain, transport: http(undefined, { retryCount: 6, retryDelay: 800 }) });

// 1. Read the order, so the invoice quotes what was agreed.
const po = (await publicClient.readContract({
  address: gateAddress,
  abi: GATE_ABI,
  functionName: "getPO",
  args: [poId],
})) as { vendor: `0x${string}`; payee: `0x${string}`; unitPrice: bigint; received: bigint; invoicedQty: bigint };

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

// 2. The vendor signs, as it always did.
const signature = await signInvoice(invoice, {
  privateKey: need("VENDOR_PRIVATE_KEY") as `0x${string}`,
  chainId,
  gateAddress,
});

// 3. Ask the gateway for a checkout. This call carries the merchant's secret, so it
//    runs on the merchant's server and never in a browser.
const session = await createCheckoutSession(
  { baseUrl: gateway, apiKey: need("CHECKOUT_API_KEY") },
  {
    invoice,
    signature,
    description: process.env["DESCRIPTION"] ?? `Order #${poId}`,
    reference: `order-${poId}`,
    successUrl: `${gateway}/docs`,
    cancelUrl: `${gateway}/docs`,
  },
);

// 4. Send the buyer here.
console.log(session.url);
