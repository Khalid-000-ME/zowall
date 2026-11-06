/**
 * Turning an x402 quote into something the match engine can judge.
 *
 * The insight this package rests on: a 402 response *is* an invoice. It names
 * a payee, a price and a thing being sold, and it asks to be paid. The only
 * reason it does not look like one is that nobody had a reason to compare it
 * to anything before.
 *
 * So the mapping is literal:
 *
 *   payTo             -> invoice payee
 *   maxAmountRequired -> invoice unit price
 *   resource          -> which mandate authorises this spend
 *   one call          -> one unit
 *
 * Once it is an invoice, the eleven existing reason codes apply unchanged. No
 * new rules engine, and no second definition of "wrong".
 */

import type { Bytes32, Hex, Invoice, PurchaseOrder } from "@zowall/gate-core";

import type { PaymentRequirements, PaymentRequiredBody } from "./types.ts";
import { isPaymentRequirements } from "./types.ts";

export type Keccak256 = (data: Hex) => Hex;

const utf8ToHex = (s: string): Hex =>
  `0x${Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("")}`;

/**
 * A mandate is identified by the resource it covers.
 *
 * The purchase order's specHash is the hash of the resource URL, so "is this
 * endpoint one we agreed to buy from" is the same question as "does an open
 * purchase order exist for this spec". Paying a different URL than the one
 * authorised is therefore a plain NO_PO, not a special case.
 */
export function resourceSpecHash(resource: string, keccak256: Keccak256): Bytes32 {
  return keccak256(utf8ToHex(normaliseResource(resource))) as Bytes32;
}

/**
 * Resource URLs are compared after normalising, because a server that quotes
 * `https://api.example.com/v1/data?k=1` and one that quotes the same path with
 * a trailing slash are selling the same thing. The query string is kept: a
 * different query is a different call, and often a different price.
 */
export function normaliseResource(resource: string): string {
  try {
    const url = new URL(resource);
    const path = url.pathname.endsWith("/") && url.pathname !== "/"
      ? url.pathname.slice(0, -1)
      : url.pathname;
    return `${url.protocol}//${url.host.toLowerCase()}${path}${url.search}`;
  } catch {
    // Not an absolute URL. Compare it as given rather than guessing an origin.
    return resource.trim();
  }
}

/**
 * The identity of this particular quote.
 *
 * Covers everything that would make it a different purchase - who is paid,
 * how much, on what network, for which resource - plus the caller's nonce.
 * Two identical calls are meant to hash differently, which is why the nonce is
 * required rather than optional: without one, a legitimate second call to the
 * same endpoint would be refused as a duplicate.
 */
export function quoteHash(
  requirements: PaymentRequirements,
  nonce: bigint,
  keccak256: Keccak256,
): Bytes32 {
  const parts = [
    normaliseResource(requirements.resource),
    requirements.payTo.toLowerCase(),
    requirements.asset.toLowerCase(),
    requirements.network,
    requirements.scheme,
    requirements.maxAmountRequired,
    nonce.toString(),
  ].join("\n");
  return keccak256(utf8ToHex(parts)) as Bytes32;
}

/** Read the quote out of a 402 response body. Returns null if it is not one. */
export function parsePaymentRequired(body: unknown): PaymentRequiredBody | null {
  if (typeof body !== "object" || body === null) return null;
  const v = body as Record<string, unknown>;
  const accepts = v["accepts"];
  if (!Array.isArray(accepts)) return null;
  const valid = accepts.filter(isPaymentRequirements);
  if (valid.length === 0) return null;
  return {
    x402Version: typeof v["x402Version"] === "number" ? v["x402Version"] : 1,
    error: typeof v["error"] === "string" ? v["error"] : "payment required",
    accepts: valid,
  };
}

/**
 * Build the invoice the engine evaluates.
 *
 * `qty` is the number of units this call consumes - one for a plain request,
 * more when a single call buys a batch. The vendor and payee come from the
 * mandate and the quote respectively, and that difference is the point: if the
 * server asks to be paid somewhere other than the address that was authorised,
 * the comparison catches it as PAYEE_MISMATCH.
 */
export function quoteToInvoice(
  requirements: PaymentRequirements,
  mandate: PurchaseOrder,
  options: { nonce: bigint; qty?: bigint; deadline?: bigint; keccak256: Keccak256 },
): Invoice {
  const qty = options.qty ?? 1n;
  return {
    poId: mandate.id,
    vendor: mandate.vendor,
    payee: requirements.payTo as Invoice["payee"],
    qty,
    unitPrice: BigInt(requirements.maxAmountRequired),
    invoiceHash: quoteHash(requirements, options.nonce, options.keccak256),
    nonce: options.nonce,
    deadline:
      options.deadline ??
      BigInt(Math.floor(Date.now() / 1000) + Math.max(60, requirements.maxTimeoutSeconds)),
  };
}
