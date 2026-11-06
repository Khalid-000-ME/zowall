import { after } from "next/server";

import { resetDemo, writeJournal } from "@/lib/demo";
import { handle } from "@/lib/demo-http";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(request: Request) {
  return handle(request, async () => {
    const { steps, journal } = await resetDemo();
    after(() => writeJournal(journal));
    return { steps };
  });
}
