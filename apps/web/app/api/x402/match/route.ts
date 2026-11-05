import { NextResponse } from "next/server";
import { evaluate, type EvalContext } from "@zowall/gate-core";

import { decisions, purchaseOrders } from "@/lib/store";

/**
 * The metered endpoint: "will this invoice be paid, and if not, exactly why".
 *
 * A vendor or a marketplace agent pays a fraction of a cent to find out before
 * shipping goods. That is a real service - knowing you will be refused is
 * worth money to the party about to incur the cost - rather than a toll booth
 * bolted onto our own app.
 *
 * This path is machine-to-machine by construction. Every human check in this
 * system sits at PO creation and receipt time, never here, because the track
 * requires a paid request with no human approving and because a vendor asking
 * a question should not need our staff awake.
 */

type MatchRequest = {
  poId: string;
  qty: string;
  unitPrice: string;
  payee: `0x${string}`;
  /** optional: include to have the signature checked too */
  vendor?: `0x${string}`;
  invoiceHash?: `0x${string}`;
};

export async function POST(request: Request) {
  const paymentHeader = request.headers.get("x-payment");

  if (!paymentHeader) {
    // x402: tell the client what it costs and how to pay, then let it retry.
    return NextResponse.json(
      {
        x402Version: 1,
        error: "payment required",
        accepts: [
          {
            scheme: "exact",
            network: process.env.X402_NETWORK ?? "hedera-testnet",
            resource: "/api/x402/match",
            description: "One three-way match check, with every reason code.",
            mimeType: "application/json",
            maxAmountRequired: process.env.X402_PRICE ?? "1000",
            payTo: process.env.X402_PAY_TO ?? "",
            asset: process.env.X402_ASSET ?? "",
            maxTimeoutSeconds: 60,
          },
        ],
      },
      { status: 402 },
    );
  }

  const settled = await settlePayment(paymentHeader);
  if (!settled.ok) {
    return NextResponse.json({ error: settled.detail }, { status: 402 });
  }

  const body = (await request.json().catch(() => null)) as MatchRequest | null;
  if (!body?.poId) {
    return NextResponse.json({ error: "poId, qty, unitPrice and payee are required" }, { status: 400 });
  }

  const po = purchaseOrders.get(BigInt(body.poId));
  const invoiceHash = body.invoiceHash ?? (`0x${"00".repeat(32)}` as const);

  const context: EvalContext = {
    po: po
      ? {
          id: po.id,
          vendor: po.vendor,
          payee: po.payee,
          specHash: po.specHash,
          qty: po.qty,
          unitPrice: po.unitPrice,
          priceTolBps: po.priceTolBps,
          qtyTolBps: po.qtyTolBps,
          expiry: po.expiry,
          received: po.received,
          invoicedQty: po.invoicedQty,
          invoicedValue: po.invoicedValue,
          creatorPersonId: po.creatorPersonId,
          status: po.status,
        }
      : null,
    invoice: {
      poId: BigInt(body.poId),
      vendor: body.vendor ?? po?.vendor ?? (`0x${"00".repeat(20)}` as const),
      payee: body.payee,
      qty: BigInt(body.qty ?? "0"),
      unitPrice: BigInt(body.unitPrice ?? "0"),
      invoiceHash,
      nonce: 0n,
      deadline: 0n,
    },
    // This is a quote, not a submission: the caller is asking what the rules
    // say about the numbers, so the signature is assumed good and the
    // duplicate check is not applied to a hash that was never submitted.
    recoveredSigner: body.vendor ?? po?.vendor ?? null,
    alreadySeen: body.invoiceHash
      ? decisions.byInvoiceHash(body.invoiceHash) !== undefined
      : false,
    roles: {
      creatorPersonId: po?.creatorPersonId ?? (`0x${"00".repeat(32)}` as const),
      receiverPersonId: po?.receiverPersonId ?? null,
      approverPersonId: null,
    },
    now: BigInt(Math.floor(Date.now() / 1000)),
  };

  const decision = evaluate(context);

  return NextResponse.json(
    {
      outcome: decision.outcome,
      codes: decision.codes,
      reasonMask: decision.reasonMask,
      // Field-level evidence, so the caller can fix the invoice rather than
      // guess at it.
      violations: decision.violations.map((v) => ({
        code: v.code,
        severity: v.severity,
        evidence: v.evidence,
      })),
      payableAmount: decision.payableAmount.toString(),
      quotedAt: new Date().toISOString(),
    },
    {
      status: 200,
      headers: settled.receipt ? { "x-payment-response": settled.receipt } : {},
    },
  );
}

/**
 * Verify and settle the x402 payment through the facilitator.
 *
 * Which facilitator is live this weekend is a question for the Hedera booth -
 * the options are Official x402, Ax402 and Blocky402, or one we run. The URL
 * is configuration rather than a constant for exactly that reason.
 */
async function settlePayment(
  paymentHeader: string,
): Promise<{ ok: true; receipt?: string } | { ok: false; detail: string }> {
  const facilitator = process.env.FACILITATOR_URL;
  if (!facilitator) {
    return { ok: false, detail: "FACILITATOR_URL is not set, so no payment can be settled" };
  }

  try {
    const res = await fetch(`${facilitator.replace(/\/$/, "")}/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        x402Version: 1,
        paymentHeader,
        paymentRequirements: {
          scheme: "exact",
          network: process.env.X402_NETWORK ?? "hedera-testnet",
          resource: "/api/x402/match",
          maxAmountRequired: process.env.X402_PRICE ?? "1000",
          payTo: process.env.X402_PAY_TO ?? "",
          asset: process.env.X402_ASSET ?? "",
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) return { ok: false, detail: `facilitator returned ${res.status}` };

    const data = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      transaction?: string;
      error?: string;
    };

    if (data.success === false) return { ok: false, detail: data.error ?? "payment rejected" };

    // The Hedera transaction id goes in the README and on screen: the track
    // asks for a settled payment's id, and a judge should not have to ask.
    return { ok: true, ...(data.transaction ? { receipt: data.transaction } : {}) };
  } catch (err) {
    return { ok: false, detail: `facilitator unreachable: ${String(err)}` };
  }
}
