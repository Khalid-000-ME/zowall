/**
 * The decision an x402 payment has to pass before it is authorised.
 *
 * This reuses `evaluate` from gate-core unchanged. That is deliberate and it
 * is the whole argument of the package: a machine payment is not a different
 * kind of payment, it is the same payment made faster, so it should face the
 * same eleven checks a finance team would apply. Writing a second, looser
 * rule set for agents would be how the control quietly stops meaning anything.
 *
 * Two things differ from the goods case, and both are stated rather than
 * hidden:
 *
 *  1. Authenticity. A goods invoice carries the vendor's EIP-712 signature. A
 *     402 quote does not: it arrives over TLS from the resource server. So the
 *     signature check is satisfied by the transport unless the server signs
 *     its quote, and the real protection against being redirected is the payee
 *     comparison, which is unaffected.
 *
 *  2. Delivery. In x402 the service is delivered as it is paid for, so there
 *     is no separate goods-receipt moment. The human approval happens once,
 *     up front, when the mandate is created for N calls: that pre-authorised
 *     quantity is the receipt. QTY_OVER_RECEIVED then means precisely
 *     "this agent has used up what a person agreed it could buy".
 */

import { evaluate, type Bytes32, type Decision, type Invoice, type PurchaseOrder, type Roles } from "@zowall/gate-core";

import { normaliseResource, payeeAddress, quoteToInvoice, type Keccak256 } from "./quote.ts";
import type { PaymentRequirements } from "./types.ts";

export type GuardDecision = {
  /** true only when the engine said PAID: no hard refusal and nothing held */
  allowed: boolean;
  decision: Decision;
  invoice: Invoice;
  requirements: PaymentRequirements;
  mandate: PurchaseOrder | null;
  /** one line an agent can log or a person can read */
  reason: string;
};

export type GuardConfig = {
  keccak256: Keccak256;
  /** the open mandate covering this resource, or null when none does */
  findMandate: (resource: string) => Promise<PurchaseOrder | null> | PurchaseOrder | null;
  /** the humans accountable for this spend, from World ID enrolment */
  roles: Roles;
  /** true when this exact quote has been decided before */
  seen?: (invoiceHash: Bytes32) => Promise<boolean> | boolean;
  /** called with every decision, allowed or not. Never blocks the answer. */
  record?: (decision: GuardDecision) => void | Promise<void>;
  /** evaluation clock, unix seconds. Injected so tests are not time-dependent. */
  now?: () => bigint;
  /** a fresh nonce per quote, so two honest calls are not read as a replay */
  nonce?: () => bigint;
};

const REASON_PREFIX = "Zowall refused this payment";

let counter = 0n;

/** Monotonic within a process, random enough across them. */
function defaultNonce(): bigint {
  counter += 1n;
  return BigInt(Date.now()) * 1000n + (counter % 1000n);
}

export function createGuard(config: GuardConfig) {
  const now = config.now ?? (() => BigInt(Math.floor(Date.now() / 1000)));
  const nonce = config.nonce ?? defaultNonce;

  return {
    /**
     * Judge one quote. Never throws because a quote was bad: a refusal is an
     * answer, and an agent that has to catch exceptions to learn it was not
     * allowed to spend will eventually catch them and carry on.
     */
    async check(
      requirements: PaymentRequirements,
      options: { qty?: bigint } = {},
    ): Promise<GuardDecision> {
      const resource = normaliseResource(requirements.resource);
      const mandate = await config.findMandate(resource);

      const n = nonce();
      const at = now();
      const invoice = mandate
        ? quoteToInvoice(requirements, mandate, {
            nonce: n,
            ...(options.qty === undefined ? {} : { qty: options.qty }),
            // The deadline has to come off the same clock the engine reads,
            // not the wall clock. Mixing the two made a freshly built quote
            // look expired, which is a refusal nobody could have explained.
            deadline: at + BigInt(Math.max(60, requirements.maxTimeoutSeconds)),
            keccak256: config.keccak256,
          })
        : syntheticInvoice(requirements, n, options.qty ?? 1n);

      const alreadySeen = mandate && config.seen ? await config.seen(invoice.invoiceHash) : false;

      const decision = evaluate({
        po: mandate,
        invoice,
        // The quote's authenticity is the TLS connection to the resource
        // server, not a vendor signature. Treating the mandate's vendor as the
        // recovered signer says so explicitly rather than failing every call
        // on a signature that this protocol never asks for.
        recoveredSigner: mandate ? mandate.vendor : null,
        alreadySeen,
        roles: config.roles,
        now: at,
      });

      const result: GuardDecision = {
        allowed: decision.outcome === "PAID",
        decision,
        invoice,
        requirements,
        mandate,
        reason: explain(decision),
      };

      if (config.record) {
        try {
          await config.record(result);
        } catch {
          // Recording is an audit concern. It must never change the decision
          // or stop a payment that the rules allowed.
        }
      }

      return result;
    },
  };
}

/**
 * When no mandate exists there is still an invoice to describe - the engine
 * needs one to report NO_PO against, and the agent needs to be told what it
 * was about to pay.
 */
function syntheticInvoice(
  requirements: PaymentRequirements,
  nonce: bigint,
  qty: bigint,
): Invoice {
  const zeroAddress = "0x0000000000000000000000000000000000000000" as Invoice["vendor"];
  const zeroHash =
    "0x0000000000000000000000000000000000000000000000000000000000000000" as Bytes32;
  return {
    poId: 0n,
    vendor: zeroAddress,
    payee: payeeAddress(requirements.payTo) as Invoice["payee"],
    qty,
    unitPrice: BigInt(requirements.amount),
    invoiceHash: zeroHash,
    nonce,
    deadline: 0n,
  };
}

function explain(decision: Decision): string {
  if (decision.outcome === "PAID") return "Matched an open mandate.";
  const codes = decision.codes.join(", ");
  return decision.outcome === "HELD"
    ? `${REASON_PREFIX} pending a person: ${codes}.`
    : `${REASON_PREFIX}: ${codes}.`;
}
