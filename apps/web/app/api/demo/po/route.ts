import { after } from "next/server";

import { raisePO, writeJournal } from "@/lib/demo";
import { handle, readBody } from "@/lib/demo-http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  return handle(request, async () => {
    const body = await readBody<{
      description: string;
      qty: string;
      unitPrice: string;
      tolerancePct: string;
      creator: string;
    }>(request);

    const { result, journal } = await raisePO(body);
    after(() => writeJournal(journal));
    return { result };
  });
}
