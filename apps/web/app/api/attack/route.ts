import { NextResponse } from "next/server";
import { REASON_TEXT, codesOf, evaluate, type EvalContext } from "@zowall/gate-core";
import { parseIntent } from "@zowall/agent";


/**
 * Runs the naive agent against the gate.
 *
 * When no contract is deployed yet this evaluates with the same gate-core the
 * contract uses, so the answer is identical to what the chain would say - and
 * the response says which path produced it rather than implying a settlement
 * that did not happen.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { text?: string } | null;
  const text = body?.text?.slice(0, 2000) ?? "";

  const intent = parseIntent(text);

  if (intent.kind === "nothing") {
    return NextResponse.json({
      narration: `The agent found no payment instruction: ${intent.because}`,
    });
  }

  if (intent.kind !== "pay_adhoc") {
    return NextResponse.json({ narration: "Not wired up yet." });
  }

  const context: EvalContext = {
    // An ad-hoc instruction has no purchase order. That is the whole finding.
    po: null,
    invoice: {
      poId: 0n,
      vendor: `0x${"00".repeat(20)}`,
      payee: intent.payee,
      qty: 1n,
      unitPrice: intent.amount,
      invoiceHash: `0x${"00".repeat(32)}`,
      nonce: BigInt(Date.now()),
      deadline: 0n,
    },
    recoveredSigner: null,
    alreadySeen: false,
    roles: {
      creatorPersonId: `0x${"00".repeat(32)}`,
      receiverPersonId: null,
      approverPersonId: null,
    },
    now: BigInt(Math.floor(Date.now() / 1000)),
  };

  const decision = evaluate(context);

  return NextResponse.json({
    narration:
      `The message says to pay ${intent.payee}. The agent believed it and asked the gate ` +
      `to send ${intent.amount} base units.`,
    outcome: decision.outcome,
    codes: decision.codes,
    explanation: decision.codes.map((c) => REASON_TEXT[c]).join(" "),
    reasonMask: decision.reasonMask,
    evaluatedBy: "gate-core (same rules as the contract)",
    allCodes: codesOf(decision.reasonMask),
  });
}
