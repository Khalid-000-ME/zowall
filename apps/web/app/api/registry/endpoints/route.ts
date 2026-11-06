import { NextResponse } from "next/server";

import { authenticate } from "@/lib/accounts";
import { listEndpoints, registerEndpoint, type EndpointInput } from "@/lib/registry";
import { fail, publicEndpoint } from "@/lib/registry-http";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Discover endpoints. Public, and limited to what is verified and public.
 * With a vendor's key and `?mine=1` it lists that vendor's own, whatever their
 * state, so a vendor can see what failed and why.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const caller = authenticate(request);
  const mine = url.searchParams.get("mine") === "1";

  if (mine && !caller) {
    return NextResponse.json({ error: "A key is needed to list your own endpoints." }, { status: 401 });
  }

  const { items, total } = listEndpoints({
    q: url.searchParams.get("q") ?? undefined,
    tag: url.searchParams.get("tag") ?? undefined,
    network: url.searchParams.get("network") ?? undefined,
    asset: url.searchParams.get("asset") ?? undefined,
    ...(mine && caller ? { merchantId: caller.id, caller } : {}),
    limit: Number(url.searchParams.get("limit") ?? 24),
    offset: Number(url.searchParams.get("offset") ?? 0),
  });

  return NextResponse.json({ total, endpoints: items.map(publicEndpoint) });
}

/**
 * Register an endpoint. The platform calls it, and it is marked verified only if
 * its own 402 names the payee and price registered here.
 */
export async function POST(request: Request) {
  const caller = authenticate(request);
  if (!caller) return NextResponse.json({ error: "Invalid API key." }, { status: 401 });

  if (caller.role !== "vendor") {
    return NextResponse.json({ error: "Only a vendor account can register endpoints." }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as EndpointInput | null;
  if (!body) return NextResponse.json({ error: "The body must be JSON." }, { status: 400 });

  try {
    const endpoint = await registerEndpoint(caller.id, body);
    return NextResponse.json({ endpoint: publicEndpoint(endpoint) }, { status: 201 });
  } catch (err) {
    return fail(err);
  }
}
