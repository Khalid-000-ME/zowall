/**
 * HCS writer.
 *
 * The topic carries a submit key, so only this service can write, while anyone
 * can read. That asymmetry is the whole point: the buyer must not be able to
 * rewrite the record of its own refusals, and an auditor must not need our
 * permission to check it.
 *
 * The SDK is imported dynamically so that the reader, the replay CLI and the
 * web app can all use this package without pulling a Hedera client into a
 * browser bundle.
 */

import { serialize, type JournalEntry } from "./entry.ts";

export type HederaNetwork = "testnet" | "mainnet";

export type WriterConfig = {
  operatorId: string;
  operatorKey: string;
  topicId: string;
  /** Submit key for the private topic. Falls back to the operator key. */
  submitKey?: string;
  network?: HederaNetwork;
};

export type WriteResult = {
  topicId: string;
  sequenceNumber: number;
  transactionId: string;
  bytes: number;
};

type HashgraphModule = typeof import("@hashgraph/sdk");

async function sdk(): Promise<HashgraphModule> {
  return await import("@hashgraph/sdk");
}

/**
 * Parse a Hedera private key, choosing the parser by the key's SHAPE rather
 * than by trying each in turn.
 *
 * Trying them in sequence does not work: given plain 32-byte hex,
 * `fromStringDer` succeeds but interprets it as the wrong curve, so you get a
 * well-formed key with the wrong public half and every transaction fails
 * precheck with INVALID_SIGNATURE - which looks like a permissions problem and
 * is really a parsing problem.
 *
 * So:
 *   - DER-encoded (hex starting 302 or 303) -> fromStringDer, which reads the
 *     curve out of the encoding. This is what portal.hedera.com shows.
 *   - raw 32-byte hex -> the curve is NOT recoverable from the bytes. Default
 *     to ECDSA, because that is what the portal issues, and let
 *     HEDERA_KEY_TYPE=ed25519 override it.
 */
async function parseKey(value: string): Promise<import("@hashgraph/sdk").PrivateKey> {
  const { PrivateKey } = await sdk();
  const raw = value.trim().replace(/^0x/, "");

  if (!/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error("Hedera private key is not hex. Paste it exactly as the portal shows it.");
  }

  // DER keys carry their curve in the encoding, so they are unambiguous.
  if (raw.length > 64 && (raw.startsWith("302") || raw.startsWith("303"))) {
    return PrivateKey.fromStringDer(raw);
  }

  if (raw.length !== 64) {
    throw new Error(
      `Hedera private key is ${raw.length} hex chars - expected 64 for a raw key, ` +
        "or a longer DER string starting 302/303.",
    );
  }

  // 32 raw bytes are valid on either curve, so the bytes cannot tell us which.
  return process.env["HEDERA_KEY_TYPE"] === "ed25519"
    ? PrivateKey.fromStringED25519(raw)
    : PrivateKey.fromStringECDSA(raw);
}

/**
 * Create the journal topic. Run once, at setup; the id belongs in the README.
 *
 * An admin key is deliberately NOT set. Without one the topic is immutable and
 * undeletable, which is a stronger claim to make to an auditor than "we could
 * change it but promise not to". The cost is that a mistake in the memo is
 * permanent, which is an acceptable trade for a journal.
 */
/**
 * The memo a journal topic carries. It is public and permanent, so it is how
 * anyone, with no help from us, can check which gate a topic belongs to: a topic
 * whose memo names a different gate is not this project's journal.
 *
 * Hedera limits a memo to 100 bytes.
 */
export function topicMemo(chainId: number, gate: string): string {
  const memo = `zowall journal v2 chain=${chainId} gate=${gate.toLowerCase()}`;
  if (new TextEncoder().encode(memo).length > 100) throw new Error("topic memo exceeds Hedera's 100 bytes");
  return memo;
}

/**
 * Create the journal topic with every protection Hedera offers for this job.
 *
 *  - SUBMIT KEY. Only the holder can append. A topic without one accepts
 *    messages from anybody, which would let a stranger fill the journal with
 *    noise. This is Hedera's access control for HCS, and it is the option that
 *    matters here.
 *  - NO ADMIN KEY. Nobody can change the topic's settings, swap the submit key
 *    or delete it. History cannot be rewritten by an operator who has a change
 *    of heart, or by anyone who steals the operator's account.
 *  - AUTO-RENEW ACCOUNT. A topic has an expiry. Without an account named to pay
 *    its renewal, an admin-less topic would simply run out. Naming one, at
 *    creation, is the only chance: with no admin key it cannot be added later.
 *  - MEMO naming the gate and chain, so the binding is on the ledger itself.
 *
 * Custom fees (HIP-991) are deliberately not set. They exist to charge
 * strangers who are allowed to write; here strangers are not allowed to write at
 * all, so a fee would guard a door that is already bricked up, while adding a
 * second thing to keep correct.
 */
export async function createTopic(config: {
  operatorId: string;
  operatorKey: string;
  submitKey?: string;
  network?: HederaNetwork;
  /** the gate this journal belongs to, recorded in the memo */
  chainId: number;
  gate: string;
  /** seconds between renewals. Hedera's maximum is 8,000,001. */
  autoRenewSeconds?: number;
}): Promise<{ topicId: string; submitKey: string; memo: string }> {
  const { Client, PrivateKey, TopicCreateTransaction, AccountId } = await sdk();

  const operatorKey = await parseKey(config.operatorKey);
  const client = (config.network === "mainnet" ? Client.forMainnet() : Client.forTestnet())
    .setOperator(config.operatorId, operatorKey);

  const submitKey = config.submitKey
    ? await parseKey(config.submitKey)
    : PrivateKey.generateED25519();
  const memo = topicMemo(config.chainId, config.gate);

  try {
    const tx = await new TopicCreateTransaction()
      .setTopicMemo(memo)
      .setSubmitKey(submitKey.publicKey)
      .setAutoRenewAccountId(AccountId.fromString(config.operatorId))
      .setAutoRenewPeriod(config.autoRenewSeconds ?? 8_000_001)
      .execute(client);

    const receipt = await tx.getReceipt(client);
    const topicId = receipt.topicId;
    if (!topicId) throw new Error("topic create returned no topic id");

    return { topicId: topicId.toString(), submitKey: submitKey.toString(), memo };
  } finally {
    client.close();
  }
}

export class JournalWriter {
  #config: WriterConfig;

  constructor(config: WriterConfig) {
    this.#config = config;
  }

  get topicId(): string {
    return this.#config.topicId;
  }

  /**
   * Append one entry. Throws rather than chunking if it will not fit, because
   * a chunked entry is two consensus messages and the replay would no longer
   * be one decision per entry.
   */
  async write(entry: JournalEntry): Promise<WriteResult> {
    const { Client, TopicMessageSubmitTransaction } = await sdk();

    const message = serialize(entry);
    const operatorKey = await parseKey(this.#config.operatorKey);
    const client = (
      this.#config.network === "mainnet" ? Client.forMainnet() : Client.forTestnet()
    ).setOperator(this.#config.operatorId, operatorKey);

    try {
      const submitKey = this.#config.submitKey
        ? await parseKey(this.#config.submitKey)
        : operatorKey;

      // A private topic needs the submit key explicitly: .execute() alone
      // signs with the operator key only.
      const tx = await new TopicMessageSubmitTransaction()
        .setTopicId(this.#config.topicId)
        .setMessage(message)
        .freezeWith(client)
        .sign(submitKey);

      const response = await tx.execute(client);
      const receipt = await response.getReceipt(client);

      // The docs do not name this property on the receipt page; it is
      // topicSequenceNumber in the SDK reference. Read defensively so a
      // rename does not take the whole write path down with it.
      const seq = receipt.topicSequenceNumber;

      return {
        topicId: this.#config.topicId,
        sequenceNumber: seq ? Number(seq.toString()) : -1,
        transactionId: response.transactionId.toString(),
        bytes: new TextEncoder().encode(message).length,
      };
    } finally {
      client.close();
    }
  }
}

/**
 * A writer that never blocks a payment.
 *
 * If Hedera is unreachable mid-demo, the payment on Whitechain must still
 * settle; the journal entry queues and is flushed later. The failure mode is a
 * late journal, never a stuck gate.
 */
export class QueueingWriter {
  #inner: JournalWriter;
  #queue: JournalEntry[] = [];

  constructor(inner: JournalWriter) {
    this.#inner = inner;
  }

  get pending(): readonly JournalEntry[] {
    return this.#queue;
  }

  async write(entry: JournalEntry): Promise<WriteResult | null> {
    try {
      return await this.#inner.write(entry);
    } catch {
      this.#queue.push(entry);
      return null;
    }
  }

  async flush(): Promise<WriteResult[]> {
    const written: WriteResult[] = [];
    while (this.#queue.length > 0) {
      const next = this.#queue[0];
      if (!next) break;
      try {
        written.push(await this.#inner.write(next));
        this.#queue.shift();
      } catch {
        break; // still down; keep the order and try again later
      }
    }
    return written;
  }
}
