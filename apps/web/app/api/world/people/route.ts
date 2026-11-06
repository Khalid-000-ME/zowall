import { NextResponse } from "next/server";

import { enrollments } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Who has verified. Pseudonymous ids and the name each person typed, nothing else. */
export async function GET() {
  const people = enrollments()
    .all()
    .map((e) => ({ label: e.label, personId: e.personId, enrolledAt: e.enrolledAt }));
  return NextResponse.json({ ok: true, people });
}
