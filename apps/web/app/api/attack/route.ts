import { after } from "next/server";
import { REASON_TEXT, evaluate, type EvalContext } from "@zowall/gate-core";
import { parseIntent } from "@zowall/agent";

import { submitInjected, writeJournal } from "@/lib/demo";
import { handle, readBody } from "@/lib/demo-http";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Runs the deliberately gullible agent against the gate.
 *
 * With the demo executor on, the agent's request goes to the real contract and
 * comes back as a transaction on Whitechain and an entry on Hedera. With it off
 * the same rules are evaluated locally by gate-core, which the contract mirrors,
 * and the response says so rather than implying a settlement that did not happen.
 */
export async function POST(request: Request) {
  return handle(request, async () => {
    const { text = "" } = await readBody<{ text?: string }>(request);
    const intent = parseIntent(text.slice(0, 2000));

    if (intent.kind !== "pay_adhoc") {
      return { narration: "The agent found no payment instruction in that message." };
    }

    const narration =
      `The message says to pay ${intent.payee}. The agent believed it and asked the gate to ` +
      `send ${Number(intent.amount) / 1_000_000} USDT.`;

    if (serverEnv().demoEnabled) {
      const { result, journal } = await submitInjected({ payee: intent.payee, amount: intent.amount });
      after(() => writeJournal(journal));
      return { narration, result, evaluatedBy: "ZowallGate on Whitechain" };
    }

    // No purchase order exists for an ad-hoc request, which is the whole finding.
    const context: EvalContext = {
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

    return {
      narration,
      outcome: decision.outcome,
      codes: decision.codes,
      explanation: decision.codes.map((c) => REASON_TEXT[c]).join(" "),
      evaluatedBy: "gate-core, locally (nothing was submitted on-chain)",
    };
  });
}
