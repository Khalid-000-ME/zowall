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
 *   amount            -> invoice unit price (v1 called it maxAmountRequired)
 *   resource          -> which mandate authorises this spend
 *   one call          -> one unit
 *
 * Once it is an invoice, the eleven existing reason codes apply unchanged. No
 * new rules engine, and no second definition of "wrong".
 */

import type { Bytes32, Hex, Invoice, PurchaseOrder } from "@zowall/gate-core";

import type { PaymentRequirements, PaymentRequiredBody } from "./types.ts";
import { PAYMENT_REQUIRED_HEADER, decodeHeader, isPaymentRequirements } from "./types.ts";

export type Keccak256 = (data: Hex) => Hex;

const utf8ToHex = (s: string): Hex =>
  `0x${Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("")}`;

/**
 * The EVM address a payee is compared as.
 *
 * A purchase order names its payee as an EVM address, because that is what the
 * Whitechain contract stores. A Hedera quote names an account id such as
 * `0.0.11338868`. Every Hedera account has a deterministic EVM address - its
 * shard, realm and number laid out as 20 big-endian bytes - so the two forms
 * identify the same account and can be compared exactly. An address that is
 * already an address is left alone.
 */
export function payeeAddress(payTo: string): Hex {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(payTo.trim());
  if (!m) return payTo as Hex;
  const [shard, realm, num] = [BigInt(m[1]!), BigInt(m[2]!), BigInt(m[3]!)];
  const hex = (n: bigint, bytes: number) => n.toString(16).padStart(bytes * 2, "0");
  return `0x${hex(shard, 4)}${hex(realm, 8)}${hex(num, 8)}` as Hex;
}

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
    requirements.amount,
    nonce.toString(),
  ].join("\n");
  return keccak256(utf8ToHex(parts)) as Bytes32;
}

/**
 * Read the quote out of a 402 response, in either protocol version.
 *
 * v2 puts the canonical copy in the base64 `PAYMENT-REQUIRED` header, so that
 * wins when present; v1, and v2 servers that also echo it, put it in the JSON
 * body. Returns null when what arrived is not an x402 quote at all, so a 402
 * from some other kind of paywall is handed back untouched.
 */
export function parsePaymentRequired(
  body: unknown,
  headers?: { get(name: string): string | null },
): PaymentRequiredBody | null {
  const fromHeader = headers?.get(PAYMENT_REQUIRED_HEADER);
  const source = (fromHeader ? decodeHeader(fromHeader) : null) ?? body;

  if (typeof source !== "object" || source === null) return null;
  const v = source as Record<string, unknown>;
  const accepts = v["accepts"];
  if (!Array.isArray(accepts)) return null;

  const top =
    typeof v["resource"] === "object" && v["resource"] !== null
      ? (v["resource"] as { url?: string; description?: string; mimeType?: string })
      : undefined;

  const normalised: PaymentRequirements[] = [];
  for (const entry of accepts) {
    if (!isPaymentRequirements(entry)) continue;
    const e = entry as Record<string, unknown>;
    const amount = String(e["amount"] ?? e["maxAmountRequired"]);
    // v1 repeats the resource in every entry; v2 states it once at the top.
    const resource =
      typeof e["resource"] === "string" ? e["resource"] : (top?.url ?? "");

    normalised.push({
      scheme: String(e["scheme"]),
      network: String(e["network"]),
      amount,
      asset: typeof e["asset"] === "string" ? e["asset"] : "",
      payTo: String(e["payTo"]),
      resource,
      description:
        typeof e["description"] === "string" ? e["description"] : (top?.description ?? ""),
      ...(typeof e["mimeType"] === "string"
        ? { mimeType: e["mimeType"] }
        : top?.mimeType
          ? { mimeType: top.mimeType }
          : {}),
      ...(e["outputSchema"] !== undefined ? { outputSchema: e["outputSchema"] } : {}),
      maxTimeoutSeconds: typeof e["maxTimeoutSeconds"] === "number" ? e["maxTimeoutSeconds"] : 60,
      ...(typeof e["extra"] === "object" && e["extra"] !== null
        ? { extra: e["extra"] as Record<string, unknown> }
        : {}),
      raw: e,
    });
  }
  if (normalised.length === 0) return null;

  return {
    x402Version: typeof v["x402Version"] === "number" ? v["x402Version"] : 1,
    error: typeof v["error"] === "string" ? v["error"] : "payment required",
    accepts: normalised,
    ...(top?.url ? { resource: { url: top.url, ...(top.description ? { description: top.description } : {}), ...(top.mimeType ? { mimeType: top.mimeType } : {}) } } : {}),
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
    payee: payeeAddress(requirements.payTo) as Invoice["payee"],
    qty,
    unitPrice: BigInt(requirements.amount),
    invoiceHash: quoteHash(requirements, options.nonce, options.keccak256),
    nonce: options.nonce,
    deadline:
      options.deadline ??
      BigInt(Math.floor(Date.now() / 1000) + Math.max(60, requirements.maxTimeoutSeconds)),
  };
}
