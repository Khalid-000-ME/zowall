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
  /**
   * Further mirror nodes to try, in order, if the first fails. Every mirror
   * serves the same ledger, so a read does not depend on any one operator being
   * up. Order is the only thing that distinguishes them.
   */
  fallbackMirrors?: string[];
  /** attempts per mirror before moving on. Default 4. */
  retries?: number;
  /** page size; the API caps this */
  limit?: number;
  order?: "asc" | "desc";
  fetchImpl?: typeof fetch;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET with the failures a public mirror node actually produces handled: a 429
 * (back off for as long as it says, or exponentially if it does not), a 5xx, and
 * a connection that simply drops. A replay that dies on the first hiccup is a
 * replay nobody can run live in front of a judge.
 */
async function getWithRetry(
  url: string,
  doFetch: typeof fetch,
  retries: number,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await doFetch(url);
      if (res.ok) return res;
      if (res.status !== 429 && res.status < 500) {
        // A 4xx other than 429 will not get better by asking again.
        throw new Error(`mirror node ${res.status} for ${url}: ${await res.text()}`);
      }
      lastError = new Error(`mirror node ${res.status} for ${url}`);
      const after = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : 400 * 2 ** attempt);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("mirror node 4")) throw err;
      lastError = err;
      await sleep(400 * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Every message on a topic, oldest first, following the cursor to the end.
 * Ascending order is deliberate: a journal is only meaningful in the order
 * consensus assigned.
 *
 * If a mirror cannot be read the next one is tried from the start, rather than
 * resuming mid-way, so a half-read topic from one node is never stitched to the
 * rest from another.
 */
export async function readTopic(
  topicId: string,
  options: ReadOptions = {},
): Promise<MirrorMessage[]> {
  const mirrors = [options.mirrorUrl ?? TESTNET_MIRROR, ...(options.fallbackMirrors ?? [])];
  const doFetch = options.fetchImpl ?? fetch;
  const limit = options.limit ?? 100;
  const retries = options.retries ?? 4;

  let lastError: unknown;
  for (const base of mirrors) {
    try {
      let path = `/api/v1/topics/${topicId}/messages?limit=${limit}&order=${options.order ?? "asc"}`;
      const all: MirrorMessage[] = [];

      while (true) {
        const res = await getWithRetry(`${base}${path}`, doFetch, retries);
        const page = (await res.json()) as MirrorPage;
        all.push(...page.messages);

        const next = page.links?.next;
        if (!next) break;
        path = next;
      }
      return all;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export type TopicInfo = {
  topic_id: string;
  memo: string;
  admin_key: unknown;
  submit_key: unknown;
  auto_renew_account: string | null;
  auto_renew_period: number | null;
};

/** The topic's own configuration, as the public ledger records it. */
export async function readTopicInfo(
  topicId: string,
  options: Pick<ReadOptions, "mirrorUrl" | "fallbackMirrors" | "retries" | "fetchImpl"> = {},
): Promise<TopicInfo> {
  const mirrors = [options.mirrorUrl ?? TESTNET_MIRROR, ...(options.fallbackMirrors ?? [])];
  const doFetch = options.fetchImpl ?? fetch;

  let lastError: unknown;
  for (const base of mirrors) {
    try {
      const res = await getWithRetry(`${base}/api/v1/topics/${topicId}`, doFetch, options.retries ?? 4);
      return (await res.json()) as TopicInfo;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
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
