import { after } from "next/server";

import { attestDelivery, writeJournal } from "@/lib/demo";
import { handle, readBody } from "@/lib/demo-http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  return handle(request, async () => {
    const body = await readBody<{ poId: string; qty: string; receiver: string }>(request);
    const { result, journal } = await attestDelivery(body);
    after(() => writeJournal(journal));
    return { result };
  });
}
