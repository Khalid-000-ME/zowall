/**
 * Journal entry format.
 *
 * Hard constraint: every entry must fit in ONE 1024-byte HCS message. Chunking
 * exists in the SDK, but each chunk is a separate consensus message, which
 * would break "one decision, one entry" - the property that makes the journal
 * replayable. So ids, hashes, codes and amounts go in the message, and
 * documents stay behind their hashes.
 *
 * Keys are short for the same reason. This is a wire format, not a UI.
 */

import type { Outcome, ReasonCode } from "@zowall/gate-core";

export const MAX_HCS_MESSAGE_BYTES = 1024;

export type EntryKind =
  | "po_created"
  | "receipt"
  | "decision"
  | "hold_resolved"
  | "po_cancelled";

export type EvmRef = {
  /** chain id, 1874 for Whitechain Sepolia */
  chain: number;
  tx: string;
  block: number;
};

type Base = {
  /** format version; bump it rather than changing a field's meaning */
  v: 1;
  kind: EntryKind;
  po: number;
  evm: EvmRef;
  /** the digest from gate-core, identical to the one in the EVM event */
  dig: string;
  /** ms since epoch, our clock, not consensus time */
  at: number;
};

export type DecisionEntry = Base & {
  kind: "decision";
  inv: string;
  outcome: Outcome;
  codes: ReasonCode[];
  qty: { inv: string; recv: string };
  unit: { inv: string; po: string };
};

export type POCreatedEntry = Base & {
  kind: "po_created";
  vendor: string;
  payee: string;
  qty: string;
  unit: string;
  enc: string;
};

export type ReceiptEntry = Base & {
  kind: "receipt";
  qty: string;
  total: string;
  deliverable: string;
};

export type HoldResolvedEntry = Base & {
  kind: "hold_resolved";
  hold: number;
  inv: string;
  approved: boolean;
  paid: string;
  amended: string;
};

export type POCancelledEntry = Base & {
  kind: "po_cancelled";
  released: string;
};

export type JournalEntry =
  | DecisionEntry
  | POCreatedEntry
  | ReceiptEntry
  | HoldResolvedEntry
  | POCancelledEntry;

export class EntryTooLargeError extends Error {
  constructor(readonly bytes: number) {
    super(
      `journal entry is ${bytes} bytes, over the ${MAX_HCS_MESSAGE_BYTES}-byte HCS limit. ` +
        `Never chunk a journal entry - put the detail behind a hash instead.`,
    );
    this.name = "EntryTooLargeError";
  }
}

/** Serialise and refuse anything that would have to be chunked. */
export function serialize(entry: JournalEntry): string {
  const json = JSON.stringify(entry);
  const bytes = new TextEncoder().encode(json).length;
  if (bytes > MAX_HCS_MESSAGE_BYTES) throw new EntryTooLargeError(bytes);
  return json;
}

export function deserialize(json: string): JournalEntry {
  return JSON.parse(json) as JournalEntry;
}

/** Decode a mirror-node `message`, which arrives base64-encoded. */
export function decodeMirrorMessage(base64: string): JournalEntry {
  return deserialize(Buffer.from(base64, "base64").toString("utf8"));
}
