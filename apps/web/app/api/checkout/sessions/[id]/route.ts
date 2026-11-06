import { NextResponse } from "next/server";

import { buildView, getSession } from "@/lib/checkout";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** The checkout as the buyer's page sees it, with the checks run against the chain now. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = getSession(id);
  if (!session) return NextResponse.json({ error: "No such checkout." }, { status: 404 });
  return NextResponse.json({ ok: true, view: await buildView(session) });
}
