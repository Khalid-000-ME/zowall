/**
 * The journal as the public sees it: read from a Hedera mirror node, keyed by
 * the EVM transaction each entry describes. No credentials, no database.
 */

import { decodeTopic, readTopic, type JournalRecord } from "@zowall/journal";

import { serverEnv } from "@/lib/env";

export type JournalIndex = {
  topicId: string | null;
  byTx: Map<string, JournalRecord>;
  records: JournalRecord[];
  error: string | null;
};

let memo: { at: number; value: JournalIndex } | null = null;

export async function getJournal(force = false): Promise<JournalIndex> {
  const topicId = serverEnv().hederaTopicId;
  if (!topicId) return { topicId: null, byTx: new Map(), records: [], error: null };

  if (!force && memo && Date.now() - memo.at < 5_000) return memo.value;

  let value: JournalIndex;
  try {
    const messages = await readTopic(topicId, { order: "asc" });
    const { records } = decodeTopic(messages);

    const byTx = new Map<string, JournalRecord>();
    for (const r of records) {
      const tx = r.entry.evm?.tx;
      if (tx) byTx.set(tx.toLowerCase(), r);
    }
    value = { topicId, byTx, records, error: null };
  } catch (err) {
    value = {
      topicId,
      byTx: new Map(),
      records: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }

  memo = { at: Date.now(), value };
  return value;
}

export function invalidateJournal(): void {
  memo = null;
}
