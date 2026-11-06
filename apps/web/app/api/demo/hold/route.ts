import { after } from "next/server";

import { resolveHoldAs, writeJournal } from "@/lib/demo";
import { handle, readBody } from "@/lib/demo-http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  return handle(request, async () => {
    const body = await readBody<{ holdId: string; approve: boolean; approver: string; requireVerified?: boolean }>(request);
    const { result, journal } = await resolveHoldAs(body);
    after(() => writeJournal(journal));
    return { result };
  });
}
