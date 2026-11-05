/**
 * Reason codes, their severity, and the bitmask shared with the contract.
 *
 * The order of REASON_CODES is the wire format. Bit index == array index, and
 * `ZowallGate.sol` mirrors this list exactly. It is APPEND-ONLY: reordering or
 * removing an entry silently reinterprets every reasonMask ever journalled.
 */

export const REASON_CODES = [
  "NO_PO",
  "BAD_SIGNATURE",
  "PAYEE_MISMATCH",
  "PO_EXPIRED",
  "PO_CLOSED",
  "DUPLICATE_INVOICE",
  "BUDGET_EXCEEDED",
  "SOD_VIOLATION",
  "NO_RECEIPT",
  "QTY_OVER_RECEIVED",
  "PRICE_OVER_TOLERANCE",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

/**
 * hard -> REJECTED, nothing parks, no human can wave it through.
 * soft -> HELD, funds stay encumbered, a different human may release it.
 */
export type Severity = "hard" | "soft";

export const SEVERITY: Readonly<Record<ReasonCode, Severity>> = Object.freeze({
  NO_PO: "hard",
  BAD_SIGNATURE: "hard",
  PAYEE_MISMATCH: "hard",
  PO_EXPIRED: "hard",
  PO_CLOSED: "hard",
  DUPLICATE_INVOICE: "hard",
  BUDGET_EXCEEDED: "hard",
  SOD_VIOLATION: "hard",
  NO_RECEIPT: "soft",
  QTY_OVER_RECEIVED: "soft",
  PRICE_OVER_TOLERANCE: "soft",
});

export const OUTCOMES = ["PAID", "HELD", "REJECTED"] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** Must match `enum Outcome` in the contract. */
export const OUTCOME_CODE: Readonly<Record<Outcome, number>> = Object.freeze({
  PAID: 0,
  HELD: 1,
  REJECTED: 2,
});

/**
 * Non-throwing check, for anything read off a public topic or an API body.
 * A journal written by a different version of the rules must be reportable,
 * not fatal.
 */
export function isReasonCode(value: string): value is ReasonCode {
  return (REASON_CODES as readonly string[]).includes(value);
}

export function bitOf(code: ReasonCode): number {
  const i = REASON_CODES.indexOf(code);
  if (i < 0) throw new Error(`unknown reason code: ${code}`);
  return i;
}

export function maskOf(codes: readonly ReasonCode[]): number {
  let mask = 0;
  for (const c of codes) mask |= 1 << bitOf(c);
  return mask >>> 0;
}

export function codesOf(mask: number): ReasonCode[] {
  const out: ReasonCode[] = [];
  REASON_CODES.forEach((code, i) => {
    if ((mask >>> i) & 1) out.push(code);
  });
  return out;
}

/** Plain-language text for the vendor portal. One line, no jargon, no blame. */
export const REASON_TEXT: Readonly<Record<ReasonCode, string>> = Object.freeze({
  NO_PO: "There is no open purchase order for this invoice.",
  BAD_SIGNATURE: "This invoice was not signed by the vendor key on the purchase order.",
  PAYEE_MISMATCH: "The payment address does not match the one on the purchase order.",
  PO_EXPIRED: "The purchase order expired before this invoice arrived.",
  PO_CLOSED: "This purchase order is fully invoiced and closed.",
  DUPLICATE_INVOICE: "This invoice has already been submitted.",
  BUDGET_EXCEEDED: "This invoice would take the total past the purchase order value.",
  SOD_VIOLATION: "The same person holds two roles on this purchase order.",
  NO_RECEIPT: "Nothing has been recorded as received yet.",
  QTY_OVER_RECEIVED: "The invoiced quantity is more than was received.",
  PRICE_OVER_TOLERANCE: "The unit price is above the agreed price and tolerance.",
});
