/**
 * Mirror-node reader. No SDK, no credentials, no permission from us.
 *
 * This is the half that makes the journal an audit artifact rather than a log:
 * anyone can replay it from a public mirror node without asking the operator.
 * Field names below were confirmed against a live response on 2026-11-05.
 */

import { decodeMirrorMessage, type JournalEntry } from "./entry.ts";

export const TESTNET_MIRROR = "https://testnet.mirrornode.hedera.com";
export const MAINNET_MIRROR = "https://mainnet-public.mirrornode.hedera.com";

/** Exactly the fields a mirror-node topic message carries. */
export type MirrorMessage = {
  chunk_info: unknown;
  consensus_timestamp: string;
  /** base64 */
  message: string;
  payer_account_id: string;
  running_hash: string;
  running_hash_version: number;
  sequence_number: number;
  topic_id: string;
};

export type MirrorPage = {
  messages: MirrorMessage[];
  links?: { next: string | null };
};

export type ReadOptions = {
  mirrorUrl?: string;
  /** page size; the API caps this */
  limit?: number;
  order?: "asc" | "desc";
  fetchImpl?: typeof fetch;
};

/**
 * Every message on a topic, oldest first, following the cursor to the end.
 * Ascending order is deliberate: a journal is only meaningful in the order
 * consensus assigned.
 */
export async function readTopic(
  topicId: string,
  options: ReadOptions = {},
): Promise<MirrorMessage[]> {
  const base = options.mirrorUrl ?? TESTNET_MIRROR;
  const doFetch = options.fetchImpl ?? fetch;
  const limit = options.limit ?? 100;

  let path = `/api/v1/topics/${topicId}/messages?limit=${limit}&order=${options.order ?? "asc"}`;
  const all: MirrorMessage[] = [];

  while (true) {
    const res = await doFetch(`${base}${path}`);
    if (!res.ok) {
      throw new Error(`mirror node ${res.status} for topic ${topicId}: ${await res.text()}`);
    }
    const page = (await res.json()) as MirrorPage;
    all.push(...page.messages);

    const next = page.links?.next;
    if (!next) break;
    path = next;
  }

  return all;
}

export type JournalRecord = {
  sequenceNumber: number;
  consensusTimestamp: string;
  runningHash: string;
  payer: string;
  entry: JournalEntry;
};

/**
 * Decode a topic into journal entries.
 *
 * A message that is not one of ours is skipped rather than thrown on: a topic
 * is public, and a stranger submitting junk to it must not be able to break
 * everyone else's replay.
 */
export function decodeTopic(messages: MirrorMessage[]): {
  records: JournalRecord[];
  skipped: Array<{ sequenceNumber: number; reason: string }>;
} {
  const records: JournalRecord[] = [];
  const skipped: Array<{ sequenceNumber: number; reason: string }> = [];

  for (const m of messages) {
    try {
      const entry = decodeMirrorMessage(m.message);
      if (entry.v !== 1 || typeof entry.kind !== "string") {
        skipped.push({ sequenceNumber: m.sequence_number, reason: "not a zowall entry" });
        continue;
      }
      records.push({
        sequenceNumber: m.sequence_number,
        consensusTimestamp: m.consensus_timestamp,
        runningHash: m.running_hash,
        payer: m.payer_account_id,
        entry,
      });
    } catch (err) {
      skipped.push({
        sequenceNumber: m.sequence_number,
        reason: err instanceof Error ? err.message : "undecodable",
      });
    }
  }

  return { records, skipped };
}

/** HashScan link for a topic, for the README and the journal page. */
export function hashscanTopicUrl(topicId: string, network: "testnet" | "mainnet" = "testnet"): string {
  return `https://hashscan.io/${network}/topic/${topicId}`;
}

export function hashscanTxUrl(txId: string, network: "testnet" | "mainnet" = "testnet"): string {
  return `https://hashscan.io/${network}/transaction/${encodeURIComponent(txId)}`;
}
