import { NextResponse } from "next/server";
import { toPersonId, verifyWorldProof } from "@zowall/world";

import { enrollments } from "@/lib/store";

/**
 * Server-side proof validation, and the only place an enrollment is created.
 *
 * The browser sends the IDKitResult and gets back a personId. It never sends
 * a personId and never receives anything it could have forged - that is
 * World's hard requirement, and the reason this is a route handler.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { proof?: unknown; address?: string; label?: string }
    | null;

  if (!body?.proof) {
    return NextResponse.json({ ok: false, detail: "no proof in request" }, { status: 400 });
  }

  // Forwarded as-is. Wrapping it in an envelope returns
  // `validation_error: responses array is required`.
  const result = await verifyWorldProof(body.proof);

  if (!result.success) {
    return NextResponse.json(
      {
        ok: false,
        detail: result.detail,
        // Not a failure of the integration: World recognised the human and
        // refused a second uniqueness proof for this action.
        alreadyVerified: result.alreadyVerified ?? false,
      },
      { status: result.alreadyVerified ? 409 : 400 },
    );
  }

  const personId = toPersonId(result.nullifier);
  enrollments.put({
    personId,
    address: (body.address ?? "").toLowerCase(),
    label: body.label?.slice(0, 40) || "Enrolled human",
    enrolledAt: Date.now(),
    live: true,
  });

  return NextResponse.json({ ok: true, personId });
}
