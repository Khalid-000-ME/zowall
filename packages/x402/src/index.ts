/**
 * @zowall/x402 - a three-way match in front of an agent's x402 payments.
 *
 * x402 answers "how does a machine pay". It does not answer "should this
 * machine be paying this, to this address, at this price, again". That second
 * question is what finance departments have asked for a century, and it is
 * the one an agent with a wallet cannot answer for itself.
 *
 *   import { createGuard, withZowall } from "@zowall/x402";
 *
 *   const guarded = withZowall({
 *     guard: createGuard({ keccak256, findMandate, roles }),
 *     signPayment,          // your x402 client still does the paying
 *   });
 *
 *   await guarded("https://api.example.com/premium");
 *
 * Anything that is not a 402 passes straight through.
 */

export { createGuard, type GuardConfig, type GuardDecision } from "./guard.ts";
export {
  PaymentRefused,
  withZowall,
  type FetchLike,
  type SignedPayment,
  type ZowallMiddlewareConfig,
} from "./middleware.ts";
export {
  normaliseResource,
  parsePaymentRequired,
  payeeAddress,
  quoteHash,
  quoteToInvoice,
  resourceSpecHash,
  type Keccak256,
} from "./quote.ts";
export {
  PAYMENT_HEADER,
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_RESPONSE_HEADER,
  PAYMENT_RESPONSE_HEADER_V1,
  PAYMENT_SIGNATURE_HEADER,
  decodeHeader,
  encodeHeader,
  isPaymentRequirements,
  settlementTx,
  type PaymentRequirements,
  type PaymentRequiredBody,
  type SettlementResponse,
} from "./types.ts";
