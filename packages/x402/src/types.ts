/**
 * The x402 wire types, as the specification defines them.
 *
 * Copied field-for-field from the protocol spec rather than from a client
 * library, because this package has to understand a 402 that any server
 * produced, not only the ones a particular SDK emits. Field names and
 * optionality follow the v1 PaymentRequirements table exactly.
 */

/** One acceptable way to pay, from the `accepts` array of a 402 response. */
export type PaymentRequirements = {
  /** payment scheme identifier, e.g. "exact" */
  scheme: string;
  /** network identifier, e.g. "hedera-testnet", "base-sepolia" */
  network: string;
  /** required amount in atomic token units, as a decimal string */
  maxAmountRequired: string;
  /** token contract address */
  asset: string;
  /** the address the money goes to */
  payTo: string;
  /** URL of the protected resource */
  resource: string;
  /** human-readable description of what is being bought */
  description: string;
  mimeType?: string;
  outputSchema?: unknown;
  /** seconds the server will wait for payment */
  maxTimeoutSeconds: number;
  /** scheme-specific extras, e.g. the token name and version */
  extra?: Record<string, unknown>;
};

/** The body of a 402 response. */
export type PaymentRequiredBody = {
  x402Version: number;
  error: string;
  accepts: PaymentRequirements[];
};

/**
 * What the resource server reports once it has settled, carried back in the
 * `X-PAYMENT-RESPONSE` header as base64 JSON. This is the closest thing x402
 * has to a delivery note, which is why the middleware records it.
 */
export type SettlementResponse = {
  success: boolean;
  transaction: string;
  network: string;
  payer: string;
  errorReason?: string;
};

export const PAYMENT_HEADER = "X-PAYMENT";
export const PAYMENT_RESPONSE_HEADER = "X-PAYMENT-RESPONSE";

/** Narrowing guard: is this object shaped like a payment requirement? */
export function isPaymentRequirements(value: unknown): value is PaymentRequirements {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["scheme"] === "string" &&
    typeof v["network"] === "string" &&
    typeof v["maxAmountRequired"] === "string" &&
    typeof v["payTo"] === "string" &&
    typeof v["resource"] === "string"
  );
}
