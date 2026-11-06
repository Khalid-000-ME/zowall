import { NextResponse } from "next/server";

import { authenticate } from "@/lib/accounts";
import {
  canManage,
  getEndpoint,
  removeEndpoint,
  updateEndpoint,
  visibleTo,
  type EndpointPatch,
} from "@/lib/registry";
import { fail, publicEndpoint } from "@/lib/registry-http";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const e = getEndpoint(id);
  // Not visible reads exactly like not found, so a private endpoint's id leaks nothing.
  if (!e || !visibleTo(e, authenticate(request))) {
    return NextResponse.json({ error: "No such endpoint." }, { status: 404 });
  }
  return NextResponse.json({ endpoint: publicEndpoint(e) });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const e = getEndpoint(id);
  if (!e || !canManage(e, authenticate(request))) {
    return NextResponse.json({ error: "No such endpoint." }, { status: 404 });
  }
  const patch = (await request.json().catch(() => null)) as EndpointPatch | null;
  if (!patch) return NextResponse.json({ error: "The body must be JSON." }, { status: 400 });
  try {
    return NextResponse.json({ endpoint: publicEndpoint(await updateEndpoint(id, patch)) });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const e = getEndpoint(id);
  if (!e || !canManage(e, authenticate(request))) {
    return NextResponse.json({ error: "No such endpoint." }, { status: 404 });
  }
  try {
    removeEndpoint(id);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return fail(err);
  }
}
