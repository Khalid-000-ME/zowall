/**
 * HTTP plumbing for the demo routes: a kill switch, a rate limit, and errors
 * that say what happened.
 *
 * These routes make the server sign and send real transactions, so they are
 * off unless DEMO_ENABLED=true and they are throttled even when on. They cannot
 * move funds anywhere a normal user could not already get them to: every call
 * goes through the gate, which is the thing being demonstrated.
 */

import { NextResponse } from "next/server";

export class DemoError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "DemoError";
    this.status = status;
  }
}

/** bigint does not survive JSON, and silently dropping one would corrupt amounts. */
export function json(data: unknown, status = 200): NextResponse {
  return new NextResponse(
    JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v)),
    { status, headers: { "content-type": "application/json" } },
  );
}

/* A global, because in dev each route can load its own copy of this module and
   a per-module Map would give every route its own allowance. */
const g = globalThis as unknown as { __zowallHits?: Map<string, number[]> };
const hits = (g.__zowallHits ??= new Map<string, number[]>());

const WINDOW_MS = 60_000;
const LIMIT = 40;

export function throttled(request: Request): boolean {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > LIMIT;
}

export async function readBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new DemoError("request body is not valid JSON");
  }
}

/** Run a handler with throttling and uniform error reporting. */
export async function handle(
  request: Request,
  run: () => Promise<unknown>,
): Promise<NextResponse> {
  if (throttled(request)) {
    return json({ ok: false, error: "too many requests, slow down a little" }, 429);
  }
  try {
    return json({ ok: true, ...((await run()) as object) });
  } catch (err) {
    if (err instanceof DemoError) return json({ ok: false, error: err.message }, err.status);
    const message = err instanceof Error ? err.message : String(err);
    // viem errors can run to several kilobytes of request detail
    return json({ ok: false, error: message.split("\n")[0]?.slice(0, 300) ?? "failed" }, 500);
  }
}
