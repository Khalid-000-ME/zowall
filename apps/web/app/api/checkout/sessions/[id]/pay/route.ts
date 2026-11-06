import { NextResponse, after } from "next/server";

import { CheckoutError, buildView, pay } from "@/lib/checkout";
import { throttled } from "@/lib/demo-http";
import { writeJournal } from "@/lib/demo";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Pay: submit the session's vendor-signed invoice to the gate.
 *
 * Whatever the gate decides is the answer. There is nothing a caller can pass to
 * change it: the invoice and its signature were fixed when the merchant created
 * the session, and the verdict comes from the contract. The decision is written
 * to the Hedera journal after the response, so the buyer never waits on it.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (throttled(request)) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  const { id } = await ctx.params;
  try {
    const { session, journal } = await pay(id);
    if (journal.length > 0) after(() => writeJournal(journal));
    return NextResponse.json({ ok: true, view: await buildView(session) });
  } catch (err) {
    if (err instanceof CheckoutError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "The payment could not be sent. Try again." }, { status: 502 });
  }
}
