import { NextResponse } from "next/server";

import { authenticate } from "@/lib/accounts";
import { canManage, getEndpoint, reverify } from "@/lib/registry";
import { fail, publicEndpoint } from "@/lib/registry-http";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** Call the endpoint again and record what it said. Only its merchant can ask. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const e = getEndpoint(id);
  if (!e || !canManage(e, authenticate(request))) {
    return NextResponse.json({ error: "No such endpoint." }, { status: 404 });
  }
  try {
    return NextResponse.json({ endpoint: publicEndpoint(await reverify(id)) });
  } catch (err) {
    return fail(err);
  }
}
