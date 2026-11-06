/**
 * The x402 wire types, as the specification defines them.
 *
 * Two protocol versions are in the field and both are read here:
 *
 *   v2 (current; what the Hedera facilitators run)
 *     402 carries a base64 `PAYMENT-REQUIRED` header. `accepts[]` holds
 *     `amount`, and `resource` sits once at the top level. The client replies
 *     with a `PAYMENT-SIGNATURE` header holding a base64 payment payload, and
 *     the server answers with `PAYMENT-RESPONSE`. Networks are CAIP-2
 *     identifiers such as `hedera:testnet`.
 *
 *   v1 (legacy)
 *     JSON body only. `accepts[]` holds `maxAmountRequired` and its own
 *     `resource`. `X-PAYMENT` and `X-PAYMENT-RESPONSE` carry the rest.
 *
 * Whatever arrives is normalised to one shape, so nothing downstream - the
 * guard, the engine mapping, the tests - has to care which dialect a server
 * speaks. The original object is kept as `raw`, because a v2 payment payload
 * must echo the requirement it accepted exactly as the server sent it.
 */

/** One acceptable way to pay, normalised from either protocol version. */
export type PaymentRequirements = {
  /** payment scheme identifier, e.g. "exact" */
  scheme: string;
  /** network identifier, e.g. "hedera:testnet" (v2) or "base-sepolia" (v1) */
  network: string;
  /** required amount in the asset's atomic units, as a decimal string */
  amount: string;
  /** token identifier: an HTS token id, a contract address, or "0.0.0" for HBAR */
  asset: string;
  /** the account the money goes to */
  payTo: string;
  /** URL of the protected resource */
  resource: string;
  /** human-readable description of what is being bought */
  description: string;
  mimeType?: string;
  outputSchema?: unknown;
  /** seconds the server will wait for payment */
  maxTimeoutSeconds: number;
  /** scheme-specific extras. On Hedera this carries the facilitator's `feePayer`. */
  extra?: Record<string, unknown>;
  /** the object exactly as the server sent it */
  raw?: Record<string, unknown>;
};

/** A 402 response, normalised. */
export type PaymentRequiredBody = {
  x402Version: number;
  error: string;
  accepts: PaymentRequirements[];
  resource?: { url: string; description?: string; mimeType?: string };
};

/**
 * What the resource server reports once it has settled. Hedera reports a
 * `transactionId` (`0.0.x@seconds.nanos`); EVM networks report `transaction`.
 */
export type SettlementResponse = {
  success: boolean;
  transaction?: string;
  transactionId?: string;
  network: string;
  payer: string;
  errorReason?: string;
};

/** v2 headers. */
export const PAYMENT_REQUIRED_HEADER = "PAYMENT-REQUIRED";
export const PAYMENT_SIGNATURE_HEADER = "PAYMENT-SIGNATURE";
export const PAYMENT_RESPONSE_HEADER = "PAYMENT-RESPONSE";

/** v1 headers. */
export const PAYMENT_HEADER = "X-PAYMENT";
export const PAYMENT_RESPONSE_HEADER_V1 = "X-PAYMENT-RESPONSE";

/** The settled transaction's id, whichever field this network uses. */
export function settlementTx(s: SettlementResponse): string {
  return s.transactionId ?? s.transaction ?? "";
}

/** Narrowing guard: is this object shaped like a payment requirement, in either dialect? */
export function isPaymentRequirements(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["scheme"] === "string" &&
    typeof v["network"] === "string" &&
    (typeof v["amount"] === "string" || typeof v["maxAmountRequired"] === "string") &&
    typeof v["payTo"] === "string"
  );
}

/** base64 of a UTF-8 JSON value, with no dependence on a particular runtime. */
export function encodeHeader(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64");
}

export function decodeHeader<T = unknown>(raw: string): T | null {
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as T;
  } catch {
    return null;
  }
}
