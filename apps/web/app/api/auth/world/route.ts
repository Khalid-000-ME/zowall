import { NextResponse } from "next/server";
import { toPersonId, verifyWorldProof } from "@zowall/world";

import {
  AccountError,
  accountByWorldId,
  createWorldAccount,
  startSession,
  validateNewAccount,
} from "@/lib/accounts";
import { setSessionCookie } from "@/lib/session";
import { authNonces } from "@/lib/world-auth";

export const dynamic = "force-dynamic";

/**
 * Sign up or sign in with a World ID proof.
 *
 * The browser sends the IDKit result. Nothing it says about who it is is believed:
 * the proof must carry a nonce this server issued a moment ago (once), World must
 * validate it, and only the nullifier World's proof carries identifies the person.
 * The same human gives the same one every time, on the login action, so:
 *
 *   a World ID with an account  -> signed in
 *   a World ID without one      -> an account, if a role and a name came with it
 *
 * Every refusal here is a plain sentence, because the person reading it has just
 * approved something on their phone and wants to know what happened.
 */

/* Memory only: slows a guesser down on one server, which is all this can promise. */
const g = globalThis as unknown as { __zowallWorldAuthHits?: Map<string, number[]> };
const hits = (g.__zowallWorldAuthHits ??= new Map<string, number[]>());
function limited(request: Request): boolean {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 20;
}

const refuse = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(request: Request) {
  if (limited(request)) return refuse("Too many attempts. Wait a minute and try again.", 429);

  const body = (await request.json().catch(() => null)) as
    | { proof?: unknown; role?: string; name?: string }
    | null;
  if (!body?.proof || typeof body.proof !== "object") return refuse("No World ID proof was sent.");

  // 1. Is this the request we issued? Used once, so a captured proof is no use.
  const nonce = (body.proof as { nonce?: unknown }).nonce;
  if (typeof nonce !== "string" || !authNonces.consume(nonce)) {
    return refuse("That request expired or was already used. Try again.");
  }

  // 2. Does World vouch for it?
  const result = await verifyWorldProof(body.proof);
  if (!result.success) {
    return refuse(
      result.alreadyVerified
        ? "World recognises you, but the sign-in action only allows one verification per person. Ask the operator to set WORLD_LOGIN_ACTION to a repeatable action."
        : `World could not verify that proof${result.detail ? `: ${result.detail}` : "."}`,
    );
  }

  let worldId: string;
  try {
    worldId = toPersonId(result.nullifier);
  } catch {
    return refuse("World's proof did not carry a usable identity.");
  }

  // 3. Someone we know, or someone new.
  const existing = accountByWorldId(worldId);
  if (existing) {
    await setSessionCookie(startSession(existing.id));
    return NextResponse.json({ ok: true, created: false });
  }

  if (!body.role && !body.name) {
    return refuse("There is no account for this World ID yet. Sign up first.", 404);
  }

  try {
    const details = validateNewAccount({ role: body.role as "vendor" | "buyer", name: body.name ?? "" });
    const { apiKey, token } = createWorldAccount({ ...details, worldId });
    await setSessionCookie(token);
    // The key is returned here and nowhere else: it is shown once, then only its hash exists.
    return NextResponse.json({ ok: true, created: true, apiKey });
  } catch (err) {
    if (err instanceof AccountError) return refuse(err.message, err.status);
    console.error("[zowall] sign-up failed", err);
    return refuse("Something went wrong. Try again.", 500);
  }
}
