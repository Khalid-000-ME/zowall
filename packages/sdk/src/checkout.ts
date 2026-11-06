/**
 * Hosted checkout, from the merchant's side.
 *
 * A merchant signs an invoice as it always did, then asks the gateway for a
 * checkout session instead of handing the buyer a signature to deal with. What
 * comes back is a URL. The buyer opens it, sees what they are paying and which
 * checks the gate has already run, and pays. The merchant never touches the buyer's
 * funds and cannot make a refused invoice pay: the gate decides.
 *
 *   const { url } = await createCheckoutSession(
 *     { baseUrl: "https://pay.example.com", apiKey },
 *     { invoice, signature, description: "2 cables", successUrl, cancelUrl },
 *   );
 *   redirect(url);
 *
 * The call needs the merchant's API key, so it belongs on the merchant's server,
 * never in a browser.
 */

import type { Invoice } from "@zowall/gate-core";

export type CheckoutConfig = {
  /** where the gateway is served, e.g. https://pay.example.com */
  baseUrl: string;
  /** the merchant's secret. Server side only. */
  apiKey: string;
  fetch?: typeof fetch;
};

export type CheckoutSessionInput = {
  invoice: Invoice;
  /** the vendor's EIP-712 signature over the invoice */
  signature: `0x${string}`;
  /** what is being bought, in the merchant's words */
  description?: string;
  /** the merchant's own reference, echoed back on the checkout */
  reference?: string;
  /** where the buyer goes after a successful payment. The session id is appended. */
  successUrl?: string;
  /** where the buyer goes if they back out or the payment is refused */
  cancelUrl?: string;
};

export type CheckoutSession = { id: string; url: string; status: "open" };

export class CheckoutError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "CheckoutError";
    this.status = status;
  }
}

/** Amounts travel as strings: JSON has no bigint, and a lossy number is a wrong payment. */
export const serialiseInvoice = (inv: Invoice) => ({
  poId: inv.poId.toString(),
  vendor: inv.vendor,
  payee: inv.payee,
  qty: inv.qty.toString(),
  unitPrice: inv.unitPrice.toString(),
  invoiceHash: inv.invoiceHash,
  nonce: inv.nonce.toString(),
  deadline: inv.deadline.toString(),
});

export async function createCheckoutSession(
  config: CheckoutConfig,
  input: CheckoutSessionInput,
): Promise<CheckoutSession> {
  const doFetch = config.fetch ?? fetch;
  const res = await doFetch(`${config.baseUrl.replace(/\/$/, "")}/api/checkout/sessions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      invoice: serialiseInvoice(input.invoice),
      signature: input.signature,
      ...(input.description ? { description: input.description } : {}),
      ...(input.reference ? { reference: input.reference } : {}),
      ...(input.successUrl ? { successUrl: input.successUrl } : {}),
      ...(input.cancelUrl ? { cancelUrl: input.cancelUrl } : {}),
    }),
  });

  const body = (await res.json().catch(() => ({}))) as Partial<CheckoutSession> & { error?: string };
  if (!res.ok || !body.url || !body.id) {
    throw new CheckoutError(body.error ?? `the gateway answered ${res.status}`, res.status);
  }
  return { id: body.id, url: body.url, status: "open" };
}
