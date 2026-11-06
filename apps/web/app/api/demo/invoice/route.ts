import { after } from "next/server";

import { submitInvoiceFor, writeJournal, type InvoiceKind } from "@/lib/demo";
import { DemoError, handle, readBody } from "@/lib/demo-http";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const KINDS: InvoiceKind[] = ["matching", "overpriced", "swapped", "forged"];

export async function POST(request: Request) {
  return handle(request, async () => {
    const body = await readBody<{ poId: string; kind: InvoiceKind; qty: string; nonce: string }>(request);
    if (!KINDS.includes(body.kind)) throw new DemoError(`kind must be one of ${KINDS.join(", ")}`);

    const { result, journal } = await submitInvoiceFor(body);
    after(() => writeJournal(journal));
    return { result };
  });
}
