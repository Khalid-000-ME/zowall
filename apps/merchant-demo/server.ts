/**
 * A merchant that bills through Zowall.
 *
 * This is the whole integration. The merchant already signs invoices for orders it
 * has fulfilled. Instead of handing the buyer a signature, it asks Zowall for a
 * checkout session and redirects the buyer to the URL that comes back. The buyer
 * sees what they owe and which checks the gate has run, and pays.
 *
 *   pnpm add @zowall/sdk              (in your own project; here it is a workspace link)
 *   ZOWALL_API_KEY=sk_live_...        a vendor key from /app/keys
 *   pnpm --filter merchant-demo start
 *
 * The key stays on this server. A browser only ever sees the redirect.
 */

import { createServer } from "node:http";

import { createPublicClient, defineChain, encodeAbiParameters, http, keccak256, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { GATE_ABI, createCheckoutSession, signInvoice, type Invoice } from "@zowall/sdk";

const need = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
};

const zowall = process.env["ZOWALL_URL"] ?? "http://localhost:3000";
const apiKey = need("ZOWALL_API_KEY");
const gateAddress = need("GATE_ADDRESS") as Address;
const chainId = Number(process.env["EVM_CHAIN_ID"] ?? 1874);
const vendorKey = need("VENDOR_PRIVATE_KEY") as `0x${string}`;
const port = Number(process.env["PORT"] ?? 4000);
const origin = `http://localhost:${port}`;

const vendor = privateKeyToAccount(vendorKey).address;
const chain = defineChain({
  id: chainId,
  name: "Whitechain Sepolia",
  nativeCurrency: { name: "WBT", symbol: "WBT", decimals: 18 },
  rpcUrls: { default: { http: [process.env["EVM_RPC_URL"] ?? "https://rpc.testnet.whitechain.io"] } },
});
const chainClient = createPublicClient({ chain, transport: http(undefined, { retryCount: 4, retryDelay: 600 }) });

type Order = { poId: bigint; payee: Address; unitPrice: bigint; billable: bigint };

/** The newest order of ours that has been delivered and not yet billed. */
async function nextBillable(): Promise<Order | null> {
  const next = (await chainClient.readContract({ address: gateAddress, abi: GATE_ABI, functionName: "nextPoId" })) as bigint;
  for (let id = next - 1n; id >= 1n && id > next - 25n; id--) {
    const po = (await chainClient.readContract({
      address: gateAddress,
      abi: GATE_ABI,
      functionName: "getPO",
      args: [id],
    })) as { vendor: Address; payee: Address; unitPrice: bigint; received: bigint; invoicedQty: bigint; encumbered: bigint };
    const billable = po.received - po.invoicedQty;
    // Delivered, not yet billed, and the money is still reserved for it. Without the
    // reservation the gate would refuse the payment, so the shop does not offer it.
    if (po.vendor.toLowerCase() === vendor.toLowerCase() && billable > 0n && po.encumbered >= billable * po.unitPrice) {
      return { poId: id, payee: po.payee, unitPrice: po.unitPrice, billable };
    }
  }
  return null;
}

const usdt = (atomic: bigint) => `${(Number(atomic) / 1e6).toFixed(2)} USDT`;

const page = (body: string) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Acme Cables</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f7fb;color:#1a1f36;font:16px/1.5 system-ui,sans-serif}
  main{width:min(420px,92vw);background:#fff;border:1px solid #e3e8ee;border-radius:14px;padding:32px}
  h1{margin:0 0 4px;font-size:22px} p{margin:0 0 20px;color:#697386}
  .row{display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid #e3e8ee}
  button{width:100%;margin-top:20px;padding:12px;border:0;border-radius:9px;background:#1a1f36;color:#fff;font:inherit;cursor:pointer}
  small{display:block;margin-top:14px;color:#8792a2}
</style><main>${body}</main>`;

createServer(async (req, res) => {
  const send = (status: number, html: string) => {
    res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  };

  try {
    if (req.method === "GET" && req.url === "/") {
      const order = await nextBillable();
      if (!order) {
        return send(
          200,
          page(`<h1>Acme Cables</h1><p>Nothing to bill yet.</p>
            <small>Raise an order and sign for a delivery in the Zowall lab, then reload.</small>`),
        );
      }
      const total = order.billable * order.unitPrice;
      return send(
        200,
        page(`<h1>Acme Cables</h1><p>Order #${order.poId}</p>
          <div class="row"><span>Quantity</span><span>${order.billable}</span></div>
          <div class="row"><span>Unit price</span><span>${usdt(order.unitPrice)}</span></div>
          <div class="row"><strong>Total</strong><strong>${usdt(total)}</strong></div>
          <form method="post" action="/checkout"><button>Pay ${usdt(total)}</button></form>
          <small>Checkout by Zowall</small>`),
      );
    }

    if (req.method === "POST" && req.url === "/checkout") {
      const order = await nextBillable();
      if (!order) return send(409, page(`<h1>Nothing to bill</h1><p>There is no delivered, unbilled order.</p>`));

      // 1. The invoice, as the vendor always signed it.
      const nonce = BigInt(Date.now());
      const invoice: Invoice = {
        poId: order.poId,
        vendor,
        payee: order.payee,
        qty: order.billable,
        unitPrice: order.unitPrice,
        invoiceHash: keccak256(
          encodeAbiParameters(
            [{ type: "uint256" }, { type: "uint128" }, { type: "uint128" }, { type: "address" }, { type: "uint256" }],
            [order.poId, order.billable, order.unitPrice, order.payee, nonce],
          ),
        ),
        nonce,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
      };
      const signature = await signInvoice(invoice, { privateKey: vendorKey, chainId, gateAddress });

      // 2. Ask Zowall for a checkout, and send the buyer to it.
      const session = await createCheckoutSession(
        { baseUrl: zowall, apiKey },
        {
          invoice,
          signature,
          description: `Acme Cables, order #${order.poId}`,
          reference: `order-${order.poId}`,
          successUrl: `${origin}/thanks`,
          cancelUrl: `${origin}/`,
        },
      );
      res.writeHead(303, { location: session.url });
      return res.end();
    }

    if (req.url?.startsWith("/thanks")) {
      return send(200, page(`<h1>Thank you</h1><p>Your payment went through. Acme will ship your order.</p><small><a href="/">Back to the shop</a></small>`));
    }

    send(404, page(`<h1>Not found</h1>`));
  } catch (err) {
    console.error(err);
    send(500, page(`<h1>Something went wrong</h1><p>${err instanceof Error ? err.message : "Try again."}</p>`));
  }
}).listen(port, () => console.log(`Acme Cables on ${origin}, billing through ${zowall}`));
