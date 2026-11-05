/**
 * One exported function per reason code. Each is pure, takes the whole
 * context, and returns a Violation or null. Nothing here reads a chain, a
 * clock or a network — `now` is passed in so a test and a contract can agree.
 *
 * Every rule guards its own preconditions, so `evaluate` can run all of them
 * in any state without ordering bugs.
 */

import { SEVERITY, type ReasonCode } from "./codes.ts";
import { lineTotal, withTolerance } from "./money.ts";
import { ZERO_PERSON, type EvalContext, type Violation } from "./types.ts";

function violation(code: ReasonCode, evidence: Record<string, string>): Violation {
  return { code, severity: SEVERITY[code], evidence: Object.freeze(evidence) };
}

const sameAddress = (a: string | null, b: string | null): boolean =>
  a !== null && b !== null && a.toLowerCase() === b.toLowerCase();

/* ---------------------------------------------------------------- hard ---- */

/** No purchase order exists, or it was cancelled, so nothing was ever ordered. */
export function noPo(ctx: EvalContext): Violation | null {
  if (ctx.po === null) {
    return violation("NO_PO", { poId: ctx.invoice.poId.toString(), found: "none" });
  }
  if (ctx.po.status === "Cancelled") {
    return violation("NO_PO", { poId: ctx.po.id.toString(), status: "Cancelled" });
  }
  return null;
}

/**
 * The invoice carries no usable vendor authorisation. Two ways to get here:
 * the recovered signer is not the PO's vendor key, or the signed payload's
 * deadline has passed. Both mean the same thing to the gate - there is no
 * valid, in-date signature from the party named on the PO - and both are hard.
 */
export function badSignature(ctx: EvalContext): Violation | null {
  if (ctx.po === null) return null;
  if (!sameAddress(ctx.recoveredSigner, ctx.po.vendor)) {
    return violation("BAD_SIGNATURE", {
      expected: ctx.po.vendor,
      recovered: ctx.recoveredSigner ?? "unrecoverable",
    });
  }
  if (ctx.invoice.deadline > 0n && ctx.now > ctx.invoice.deadline) {
    return violation("BAD_SIGNATURE", {
      reason: "deadline_passed",
      deadline: ctx.invoice.deadline.toString(),
      now: ctx.now.toString(),
    });
  }
  return null;
}

/** Money is being pointed somewhere the purchase order never named. */
export function payeeMismatch(ctx: EvalContext): Violation | null {
  if (ctx.po === null) return null;
  if (!sameAddress(ctx.invoice.payee, ctx.po.payee)) {
    return violation("PAYEE_MISMATCH", {
      poPayee: ctx.po.payee,
      invoicePayee: ctx.invoice.payee,
    });
  }
  return null;
}

export function poExpired(ctx: EvalContext): Violation | null {
  if (ctx.po === null) return null;
  if (ctx.po.expiry > 0n && ctx.now > ctx.po.expiry) {
    return violation("PO_EXPIRED", {
      expiry: ctx.po.expiry.toString(),
      now: ctx.now.toString(),
    });
  }
  return null;
}

/** Closed by hand, or fully invoiced already. */
export function poClosed(ctx: EvalContext): Violation | null {
  if (ctx.po === null) return null;
  if (ctx.po.status === "Closed") {
    return violation("PO_CLOSED", { poId: ctx.po.id.toString(), status: "Closed" });
  }
  if (ctx.po.invoicedQty >= ctx.po.qty) {
    return violation("PO_CLOSED", {
      invoicedQty: ctx.po.invoicedQty.toString(),
      orderedQty: ctx.po.qty.toString(),
    });
  }
  return null;
}

export function duplicateInvoice(ctx: EvalContext): Violation | null {
  if (!ctx.alreadySeen) return null;
  return violation("DUPLICATE_INVOICE", { invoiceHash: ctx.invoice.invoiceHash });
}

/**
 * There is no encumbrance left to pay this quantity at the agreed price.
 *
 * Three deliberate asymmetries, each with a reason:
 *
 * 1. The incoming line is valued at the PO unit price, not the invoice price,
 *    so a price overage is reported once - as PRICE_OVER_TOLERANCE - rather
 *    than a second time here.
 * 2. Value already invoiced is carried at the price actually paid, because
 *    that is the money genuinely gone from the reservation. So an approved
 *    over-priced hold eats budget, and the next invoice feels it.
 * 3. Suppressed when this invoice's own quantity is over the received
 *    allowance. One fact, one code, most specific wins: a quantity variance
 *    is reviewable by a human, so it parks as QTY_OVER_RECEIVED instead of
 *    being hard-rejected as a budget breach. Without this, every
 *    over-quantity invoice would reject, and the usual real case - a trusted
 *    vendor billing 120 when 100 arrived - could never reach the exception
 *    queue, which is the entire point of having one.
 */
export function budgetExceeded(ctx: EvalContext): Violation | null {
  if (ctx.po === null) return null;
  if (qtyOverReceived(ctx) !== null) return null;
  const poTotal = lineTotal(ctx.po.qty, ctx.po.unitPrice);
  const incoming = lineTotal(ctx.invoice.qty, ctx.po.unitPrice);
  const cumulative = ctx.po.invoicedValue + incoming;
  if (cumulative > poTotal) {
    return violation("BUDGET_EXCEEDED", {
      poTotal: poTotal.toString(),
      alreadyInvoiced: ctx.po.invoicedValue.toString(),
      incoming: incoming.toString(),
    });
  }
  return null;
}

/**
 * Segregation of duties. Compares enrollment personIds, never per-event
 * nullifiers, because a nullifier is scoped to one action and cannot be
 * compared across roles.
 */
export function sodViolation(ctx: EvalContext): Violation | null {
  const { creatorPersonId, receiverPersonId, approverPersonId } = ctx.roles;
  const held: Array<[string, string]> = [
    ["creator", creatorPersonId],
    ["receiver", receiverPersonId ?? ZERO_PERSON],
    ["approver", approverPersonId ?? ZERO_PERSON],
  ].filter((e): e is [string, string] => e[1] !== ZERO_PERSON);

  for (let i = 0; i < held.length; i++) {
    for (let j = i + 1; j < held.length; j++) {
      const a = held[i];
      const b = held[j];
      if (a && b && a[1].toLowerCase() === b[1].toLowerCase()) {
        return violation("SOD_VIOLATION", {
          roleA: a[0],
          roleB: b[0],
          personId: a[1],
        });
      }
    }
  }
  return null;
}

/* ---------------------------------------------------------------- soft ---- */

/** Nothing has been attested as delivered yet. Becomes payable when it is. */
export function noReceipt(ctx: EvalContext): Violation | null {
  if (ctx.po === null) return null;
  if (ctx.po.received === 0n) {
    return violation("NO_RECEIPT", { receivedQty: "0" });
  }
  return null;
}

/**
 * Invoiced quantity is more than was received, less what is already invoiced.
 * Suppressed when nothing has been received at all, because NO_RECEIPT already
 * says that and one fact should not produce two codes.
 */
export function qtyOverReceived(ctx: EvalContext): Violation | null {
  if (ctx.po === null || ctx.po.received === 0n) return null;
  const ceiling = withTolerance(ctx.po.received, ctx.po.qtyTolBps);
  const available = ceiling > ctx.po.invoicedQty ? ceiling - ctx.po.invoicedQty : 0n;
  if (ctx.invoice.qty > available) {
    return violation("QTY_OVER_RECEIVED", {
      invoicedNow: ctx.invoice.qty.toString(),
      receivedQty: ctx.po.received.toString(),
      alreadyInvoicedQty: ctx.po.invoicedQty.toString(),
      available: available.toString(),
    });
  }
  return null;
}

export function priceOverTolerance(ctx: EvalContext): Violation | null {
  if (ctx.po === null) return null;
  const ceiling = withTolerance(ctx.po.unitPrice, ctx.po.priceTolBps);
  if (ctx.invoice.unitPrice > ceiling) {
    return violation("PRICE_OVER_TOLERANCE", {
      poUnitPrice: ctx.po.unitPrice.toString(),
      invoiceUnitPrice: ctx.invoice.unitPrice.toString(),
      tolBps: String(ctx.po.priceTolBps),
      ceiling: ceiling.toString(),
    });
  }
  return null;
}

/** Fixed evaluation order. Every rule runs; none short-circuits another. */
export const RULES: ReadonlyArray<{
  code: ReasonCode;
  check: (ctx: EvalContext) => Violation | null;
}> = Object.freeze([
  { code: "NO_PO" as const, check: noPo },
  { code: "BAD_SIGNATURE" as const, check: badSignature },
  { code: "PAYEE_MISMATCH" as const, check: payeeMismatch },
  { code: "PO_EXPIRED" as const, check: poExpired },
  { code: "PO_CLOSED" as const, check: poClosed },
  { code: "DUPLICATE_INVOICE" as const, check: duplicateInvoice },
  { code: "BUDGET_EXCEEDED" as const, check: budgetExceeded },
  { code: "SOD_VIOLATION" as const, check: sodViolation },
  { code: "NO_RECEIPT" as const, check: noReceipt },
  { code: "QTY_OVER_RECEIVED" as const, check: qtyOverReceived },
  { code: "PRICE_OVER_TOLERANCE" as const, check: priceOverTolerance },
]);
