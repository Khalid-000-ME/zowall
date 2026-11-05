import { NextResponse } from "next/server";

import { missing, serverEnv } from "@/lib/env";

/** What is wired up and what is not. Honest about it. */
export async function GET() {
  const env = serverEnv();
  const notConfigured = missing(env);

  return NextResponse.json({
    ok: notConfigured.length === 0,
    chainId: env.chainId,
    gateAddress: env.gateAddress,
    hederaTopicId: env.hederaTopicId,
    missing: notConfigured,
  });
}
