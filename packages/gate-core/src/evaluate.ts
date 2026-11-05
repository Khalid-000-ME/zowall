/**
 * The decision. Runs every rule, returns every failure.
 *
 * It returns all failing codes rather than the first, because an accounts
 * payable clerk needs the whole list to act once, and because "rejected for
 * one reason" hides the other three.
 */

import { OUTCOME_CODE, maskOf, type Outcome } from "./codes.ts";
import { lineTotal } from "./money.ts";
import { RULES } from "./rules.ts";
import type { Decision, EvalContext } from "./types.ts";

export function evaluate(ctx: EvalContext): Decision {
  const violations = RULES.map((r) => r.check(ctx)).filter((v) => v !== null);

  const hasHard = violations.some((v) => v.severity === "hard");
  const outcome: Outcome = hasHard ? "REJECTED" : violations.length > 0 ? "HELD" : "PAID";
  const codes = violations.map((v) => v.code);

  return {
    outcome,
    codes,
    reasonMask: maskOf(codes),
    violations,
    payableAmount:
      outcome === "PAID" ? lineTotal(ctx.invoice.qty, ctx.invoice.unitPrice) : 0n,
  };
}

/** Numeric outcome, for the event and the digest. */
export function outcomeCode(outcome: Outcome): number {
  return OUTCOME_CODE[outcome];
}

/**
 * Would this hold clear on its own if re-evaluated now? Used by the
 * permissionless `retry()` path: a hold blocked only by NO_RECEIPT becomes
 * payable the moment a receipt lands, with no human involved.
 */
export function clearsOnRetry(ctx: EvalContext): boolean {
  return evaluate(ctx).outcome === "PAID";
}
