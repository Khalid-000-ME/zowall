import { NextResponse } from "next/server";
import { toPersonId, verifyWorldProof } from "@zowall/world";

import { enrollments } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Server-side proof validation, and the only place an enrolment is created.
 *
 * The browser sends the IDKit result and gets back a personId. It never sends a
 * personId and never receives anything it could have forged: World's hard
 * requirement, and the reason this is a route handler.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { proof?: unknown; label?: string }
    | null;

  if (!body?.proof) {
    return NextResponse.json({ ok: false, detail: "no proof in request" }, { status: 400 });
  }

  const label = (body.label ?? "").trim().slice(0, 40) || "Enrolled person";

  // Forwarded as received. Wrapping it in an envelope returns
  // `validation_error: responses array is required`.
  const result = await verifyWorldProof(body.proof);

  // World only reports "already used" after validating the proof cryptographically,
  // so a nullifier read from a proof in that state is as trustworthy as a fresh one.
  // Treating it as a failure would strand anyone who enrolled before and lost their
  // local record.
  if (result.success || (result.alreadyVerified && result.nullifier)) {
    const personId = toPersonId(result.nullifier);
    const store = enrollments();
    const known = store.get(personId);

    if (!known) {
      store.put({ personId, address: "", label, enrolledAt: Date.now(), live: true });
    }

    return NextResponse.json({
      ok: true,
      personId,
      label: known?.label ?? label,
      alreadyEnrolled: Boolean(known),
      recognised: !result.success,
    });
  }

  return NextResponse.json(
    { ok: false, detail: result.detail, alreadyVerified: result.alreadyVerified ?? false },
    { status: result.alreadyVerified ? 409 : 400 },
  );
}
