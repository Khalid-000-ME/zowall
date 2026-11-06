/**
 * The middleware.
 *
 * x402 gives an agent a wallet and removes every point of friction between
 * wanting something and paying for it. That is the achievement, and it is also
 * the problem: the protocol has no opinion about whether a payment should
 * happen, only about how. This wraps the agent's fetch and puts the opinion
 * back.
 *
 * It sits where it has to sit to be worth anything - between seeing the quote
 * and authorising the payment:
 *
 *     agent  ->  withZowall  ->  resource server
 *                    |
 *                    +-- 402 arrives: match the quote against a mandate
 *                    +-- refused: the payment is never signed
 *                    +-- allowed: sign, retry, record what settled
 *
 * Everything that is not a 402 passes through untouched, so wrapping a client
 * costs nothing on free endpoints and the agent's existing code does not
 * change. An x402 client library still does the paying: this never sees a key.
 */

import type { GuardDecision } from "./guard.ts";
import {
  PAYMENT_HEADER,
  PAYMENT_RESPONSE_HEADER,
  type PaymentRequirements,
  type SettlementResponse,
} from "./types.ts";
import { parsePaymentRequired } from "./quote.ts";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type ZowallMiddlewareConfig = {
  /** the gate. Anything with a `check` of this shape will do. */
  guard: { check: (r: PaymentRequirements, o?: { qty?: bigint }) => Promise<GuardDecision> };
  /**
   * Produces the `X-PAYMENT` header value for an approved quote. This is the
   * x402 client's job - wallet, scheme and signing all stay on its side of the
   * boundary, and this package never holds a key.
   */
  signPayment: (requirements: PaymentRequirements) => Promise<string>;
  /** defaults to global fetch */
  fetch?: FetchLike;
  /** which of the offered requirements to use. Defaults to the first. */
  select?: (accepts: PaymentRequirements[]) => PaymentRequirements | undefined;
  /** units this call consumes against the mandate. Defaults to one. */
  units?: (input: string | URL | Request, requirements: PaymentRequirements) => bigint;
  /**
   * What a refused payment looks like to the agent.
   * "response" (default) hands back a 402 carrying the reason codes, which
   * keeps the agent on its normal error path. "throw" raises PaymentRefused
   * for callers that would rather not check.
   */
  onRefusal?: "response" | "throw";
  /** called after a payment settles, with what the server reported */
  onSettled?: (settlement: SettlementResponse, decision: GuardDecision) => void | Promise<void>;
};

export class PaymentRefused extends Error {
  readonly decision: GuardDecision;

  constructor(decision: GuardDecision) {
    super(decision.reason);
    this.name = "PaymentRefused";
    this.decision = decision;
  }
}

/** Wraps a fetch. The returned function has the same signature. */
export function withZowall(config: ZowallMiddlewareConfig): FetchLike {
  const inner = config.fetch ?? ((i, o) => fetch(i, o));
  const select = config.select ?? ((a: PaymentRequirements[]) => a[0]);

  return async function guarded(input, init) {
    const first = await inner(input, init);
    if (first.status !== 402) return first;

    // Read the body from a clone: if this turns out not to be an x402 quote
    // the caller still gets a response whose body has not been consumed.
    const body = await first
      .clone()
      .json()
      .catch(() => null);
    const quote = parsePaymentRequired(body);
    if (!quote) return first;

    const requirements = select(quote.accepts);
    if (!requirements) return first;

    const units = config.units?.(input, requirements);
    const decision = await config.guard.check(
      requirements,
      units === undefined ? {} : { qty: units },
    );

    if (!decision.allowed) {
      if (config.onRefusal === "throw") throw new PaymentRefused(decision);
      return refusalResponse(decision, quote.x402Version);
    }

    const header = await config.signPayment(requirements);
    const paid = await inner(input, withHeader(init, PAYMENT_HEADER, header));

    const settlement = readSettlement(paid);
    if (settlement && config.onSettled) {
      try {
        await config.onSettled(settlement, decision);
      } catch {
        // Recording what settled must not fail a call the agent already paid for.
      }
    }

    return paid;
  };
}

/**
 * A refusal shaped like the protocol's own 402, so an agent that already
 * handles "payment required" handles this too. The extra field says who
 * refused and why, in the protocol's reason-code vocabulary rather than ours
 * alone.
 */
function refusalResponse(decision: GuardDecision, version: number): Response {
  return new Response(
    JSON.stringify({
      x402Version: version,
      error: decision.reason,
      accepts: [],
      zowall: {
        outcome: decision.decision.outcome,
        codes: decision.decision.codes,
        mandate: decision.mandate ? decision.mandate.id.toString() : null,
        quotedAmount: decision.requirements.maxAmountRequired,
        payTo: decision.requirements.payTo,
        resource: decision.requirements.resource,
        violations: decision.decision.violations.map((v) => ({
          code: v.code,
          severity: v.severity,
          evidence: v.evidence,
        })),
      },
    }),
    {
      status: 402,
      headers: { "content-type": "application/json", "x-zowall-outcome": decision.decision.outcome },
    },
  );
}

function withHeader(init: RequestInit | undefined, name: string, value: string): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set(name, value);
  return { ...init, headers };
}

function readSettlement(response: Response): SettlementResponse | null {
  const raw = response.headers.get(PAYMENT_RESPONSE_HEADER);
  if (!raw) return null;
  try {
    const json = JSON.parse(
      typeof atob === "function"
        ? atob(raw)
        : Buffer.from(raw, "base64").toString("utf8"),
    ) as SettlementResponse;
    return typeof json === "object" && json !== null ? json : null;
  } catch {
    return null;
  }
}
