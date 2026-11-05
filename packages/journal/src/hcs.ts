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
export async function createTopic(config: {
  operatorId: string;
  operatorKey: string;
  submitKey?: string;
  network?: HederaNetwork;
  memo?: string;
}): Promise<{ topicId: string; submitKey: string }> {
  const { Client, PrivateKey, TopicCreateTransaction } = await sdk();

  const operatorKey = await parseKey(config.operatorKey);
  const client = (config.network === "mainnet" ? Client.forMainnet() : Client.forTestnet())
    .setOperator(config.operatorId, operatorKey);

  const submitKey = config.submitKey
    ? await parseKey(config.submitKey)
    : PrivateKey.generateED25519();

  try {
    const tx = await new TopicCreateTransaction()
      .setTopicMemo(config.memo ?? "zowall journal v1") // 100 bytes max
      .setSubmitKey(submitKey.publicKey)
      .execute(client);

    const receipt = await tx.getReceipt(client);
    const topicId = receipt.topicId;
    if (!topicId) throw new Error("topic create returned no topic id");

    return { topicId: topicId.toString(), submitKey: submitKey.toString() };
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
