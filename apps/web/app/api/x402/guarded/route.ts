import { NextResponse } from "next/server";

import { runScenario, type ScenarioId } from "@/lib/x402-demo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID: ScenarioId[] = ["honest", "unauthorised", "payee-swap", "price-hike", "replay", "bypass"];

/**
 * Run the middleware once and report what it did.
 *
 * Deliberately a POST with no arguments beyond the scenario: there is nothing
 * a caller can pass that would change the verdict, because the verdict comes
 * from a purchase order on the chain and not from this request.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { scenario?: string } | null;
  const scenario = body?.scenario as ScenarioId | undefined;

  if (!scenario || !VALID.includes(scenario)) {
    return NextResponse.json({ ok: false, error: "unknown scenario" }, { status: 400 });
  }

  try {
    const origin = new URL(request.url).origin;
    const result = await runScenario(scenario, origin);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
