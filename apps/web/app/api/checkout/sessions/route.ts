import { NextResponse } from "next/server";

import { authorised, createSession, validate, type NewSession } from "@/lib/checkout";

export const dynamic = "force-dynamic";

/**
 * Create a checkout session from an invoice the merchant has signed.
 *
 * This is the merchant's call, made from their server with their secret, so it is
 * refused outright when no secret is configured rather than left open. The body is
 * the invoice, its EIP-712 signature, and where to send the buyer afterwards.
 * What comes back is the URL to send the buyer to.
 */
export async function POST(request: Request) {
  const auth = authorised(request);
  if (auth.status === "denied") {
    return NextResponse.json({ error: "Invalid API key." }, { status: 401 });
  }
  if (auth.status === "forbidden") {
    return NextResponse.json({ error: "Only a vendor account can create checkout sessions." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Partial<NewSession> | null;
  const checked = validate(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const session = createSession(checked.value, auth.merchantId);
  const origin = new URL(request.url).origin;

  return NextResponse.json(
    { id: session.id, url: `${origin}/checkout/${session.id}`, status: session.status },
    { status: 201 },
  );
}
