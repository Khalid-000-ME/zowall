import { handle } from "@/lib/demo-http";
import { getJournal } from "@/lib/journal-read";

export const dynamic = "force-dynamic";

/**
 * Has the Hedera entry for this transaction landed yet? The walkthrough polls
 * this after each step, because a consensus round trip outlasts the response.
 * Reads the public mirror node, so there is nothing here to protect.
 */
export async function GET(request: Request) {
  return handle(request, async () => {
    const tx = new URL(request.url).searchParams.get("tx")?.toLowerCase();
    if (!tx) return { found: false };

    const journal = await getJournal(true);
    const record = journal.byTx.get(tx);
    if (!record) return { found: false, topic: journal.topicId };

    return {
      found: true,
      topic: journal.topicId,
      sequence: record.sequenceNumber,
      consensus: record.consensusTimestamp,
      kind: record.entry.kind,
      digest: record.entry.dig,
    };
  });
}
