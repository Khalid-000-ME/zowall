/**
 * The reconciliation.
 *
 * Pulls every message from the Hedera topic, then for each decision takes the
 * EVM event's fields, recomputes the digest with gate-core, and asserts it
 * equals the digest written on Hedera.
 *
 * That ordering matters. Comparing two stored digests only proves nobody
 * retyped a hash. Recomputing one from the chain's own log and matching it to
 * the journal proves the entry describes the decision the contract actually
 * made - and gate-core, not the journal, is what does the computing.
 *
 * What it does not prove: that the rules are right. The two test suites argue
 * that. This argues that nobody edited the record afterwards.
 */

import {
  codesOf,
  isReasonCode,
  journalDigest,
  maskOf,
  type Bytes32,
  type DigestInput,
  type Keccak256,
  type Outcome,
} from "@zowall/gate-core";

import type { DecisionEntry } from "./entry.ts";
import { topicMemo } from "./hcs.ts";
import { decodeTopic, readTopic, readTopicInfo, type MirrorMessage, type ReadOptions } from "./mirror.ts";

/**
 * Everything the EVM `Decision` event and its purchase order give us. The
 * person ids come from here rather than from the journal: a nullifier is
 * pseudonymous but still an identifier, and the topic is world-readable.
 */
export type EvmDecision = {
  poId: bigint;
  invoiceHash: Bytes32;
  outcome: Outcome;
  reasonMask: number;
  invQty: bigint;
  recvQty: bigint;
  invUnitPrice: bigint;
  poUnitPrice: bigint;
  creatorPersonId: Bytes32;
  receiverPersonId: Bytes32;
  approverPersonId: Bytes32;
  nonce: bigint;
  journalDigest: Bytes32;
  txHash: string;
  blockNumber: number;
  /** USDT base units moved by this decision; 0 unless it paid. */
  paid?: bigint;
  /** hold created by this decision, 0 when it did not park one. */
  holdId?: bigint;
};

/**
 * Looks up what the chain logged for one decision.
 *
 * Keyed on the transaction, not the invoice hash: the same invoice can be
 * decided more than once - submit it twice and you get a PAID and a
 * DUPLICATE_INVOICE over identical invoice bytes - so an invoice hash does not
 * identify a decision. The journal entry carries its own `evm.tx`, which does.
 */
export type EvmSource = (
  ref: { invoiceHash: string; txHash: string },
) => Promise<EvmDecision | null> | EvmDecision | null;

export type ReplayFinding =
  | { kind: "ok"; seq: number; detail: string }
  | { kind: "evm_missing"; seq: number; invoiceHash: string }
  | { kind: "digest_mismatch"; seq: number; recomputed: string; journal: string; onChain: string }
  | { kind: "field_disagrees"; seq: number; field: string; chain: string; journal: string }
  | { kind: "unknown_code"; seq: number; detail: string }
  | { kind: "skipped"; seq: number; reason: string }
  /** Properties of the ledger record itself, not of any one decision. */
  | { kind: "ledger_ok"; detail: string }
  | { kind: "sequence_gap"; expected: number; found: number }
  | { kind: "time_not_increasing"; seq: number; previous: string; found: string }
  | { kind: "foreign_payer"; seq: number; payer: string; expected: string }
  | { kind: "chunked"; seq: number }
  | { kind: "topic_open"; detail: string }
  | { kind: "topic_mutable"; detail: string }
  | { kind: "topic_memo"; memo: string; expected: string }
  | { kind: "topic_unreadable"; reason: string };

export type ReplayReport = {
  topicId: string;
  entries: number;
  decisions: number;
  findings: ReplayFinding[];
  ok: boolean;
};

export type ReplayOptions = ReadOptions & {
  keccak256: Keccak256;
  chainId: number;
  gateAddress: `0x${string}`;
  /** Omit to check the journal's internal consistency only. */
  evmSource?: EvmSource;
  /**
   * The account that pays for the journal's messages. Anything paid for by
   * another account was submitted by someone else holding the submit key, which
   * should be nobody. Omit to skip the check.
   */
  expectedPayer?: string;
  /** Set false to skip reading the topic's own configuration. Default true. */
  checkTopic?: boolean;
};

export async function replay(topicId: string, options: ReplayOptions): Promise<ReplayReport> {
  const messages = await readTopic(topicId, options);
  const { records, skipped } = decodeTopic(messages);

  const findings: ReplayFinding[] = skipped.map((s) => ({
    kind: "skipped" as const,
    seq: s.sequenceNumber,
    reason: s.reason,
  }));

  findings.push(...checkLedger(messages, options.expectedPayer));
  if (options.checkTopic !== false) findings.push(...(await checkTopic(topicId, options)));

  let decisions = 0;
  for (const record of records) {
    if (record.entry.kind !== "decision") continue;
    decisions++;
    findings.push(...(await checkDecision(record.sequenceNumber, record.entry, options)));
  }

  return {
    topicId,
    entries: records.length,
    decisions,
    findings,
    ok: findings.every((f) => f.kind === "ok" || f.kind === "skipped" || f.kind === "ledger_ok"),
  };
}

/** "seconds.nanos" as a single comparable number. */
const stamp = (t: string): bigint => {
  const [secs = "0", nanos = "0"] = t.split(".");
  return BigInt(secs) * 1_000_000_000n + BigInt(nanos.padEnd(9, "0").slice(0, 9));
};

/**
 * What can be checked about the record without knowing what any entry means.
 *
 * Consensus numbers every message on a topic 1, 2, 3 with no gaps and stamps
 * them with strictly increasing times. A mirror node that dropped or reordered a
 * message would break one of those, so an auditor reading from a node they do
 * not trust still notices. These checks cannot see a missing TAIL - the newest
 * messages - because nothing later exists to expose the gap; reading a second
 * mirror covers that.
 */
export function checkLedger(messages: MirrorMessage[], expectedPayer?: string): ReplayFinding[] {
  const out: ReplayFinding[] = [];
  let previous: string | null = null;
  let expected = 1;
  let clean = true;

  for (const m of messages) {
    if (m.sequence_number !== expected) {
      out.push({ kind: "sequence_gap", expected, found: m.sequence_number });
      clean = false;
      expected = m.sequence_number;
    }
    expected += 1;

    if (previous !== null && stamp(m.consensus_timestamp) <= stamp(previous)) {
      out.push({ kind: "time_not_increasing", seq: m.sequence_number, previous, found: m.consensus_timestamp });
      clean = false;
    }
    previous = m.consensus_timestamp;

    // The mirror node attaches chunk_info to EVERY message, with total 1 when it
    // was not split. Only a message that was actually split is a finding.
    const total = (m.chunk_info as { total?: number } | null)?.total ?? 1;
    if (total > 1) {
      out.push({ kind: "chunked", seq: m.sequence_number });
      clean = false;
    }
    if (expectedPayer && m.payer_account_id !== expectedPayer) {
      out.push({ kind: "foreign_payer", seq: m.sequence_number, payer: m.payer_account_id, expected: expectedPayer });
      clean = false;
    }
  }

  if (clean) {
    out.unshift({
      kind: "ledger_ok",
      detail: `${messages.length} messages, sequence 1..${messages.length} with no gaps, consensus times increasing${
        expectedPayer ? `, all paid by ${expectedPayer}` : ""
      }`,
    });
  }
  return out;
}

/**
 * The topic's own settings, read from the public ledger and judged against what
 * a journal topic has to be: closed to strangers, impossible to alter, and
 * bound to this gate by its memo.
 */
async function checkTopic(topicId: string, options: ReplayOptions): Promise<ReplayFinding[]> {
  let info;
  try {
    info = await readTopicInfo(topicId, options);
  } catch (err) {
    return [{ kind: "topic_unreadable", reason: err instanceof Error ? err.message : String(err) }];
  }

  const out: ReplayFinding[] = [];
  if (info.submit_key == null) {
    out.push({ kind: "topic_open", detail: "no submit key: anyone can append to this topic" });
  }
  if (info.admin_key != null) {
    out.push({ kind: "topic_mutable", detail: "an admin key exists: the topic can be changed or deleted" });
  }

  const expected = topicMemo(options.chainId, options.gateAddress);
  if (info.memo !== expected) out.push({ kind: "topic_memo", memo: info.memo, expected });

  if (out.length === 0) {
    out.push({
      kind: "ledger_ok",
      detail: `topic is closed (submit key set), immutable (no admin key) and its memo names this gate${
        info.auto_renew_account ? `; renewal paid by ${info.auto_renew_account}` : ""
      }`,
    });
  }
  return out;
}

async function checkDecision(
  seq: number,
  entry: DecisionEntry,
  options: ReplayOptions,
): Promise<ReplayFinding[]> {
  const out: ReplayFinding[] = [];

  // Reason codes have to be ones this build knows. An unrecognised code means
  // the journal was written by a different version of the rules, and the
  // replay must say so rather than quietly dropping it.
  const known = entry.codes.filter((c) => isReasonCode(c));
  const mask = maskOf(known);
  if (known.length !== entry.codes.length) {
    out.push({
      kind: "unknown_code",
      seq,
      detail: `entry lists [${entry.codes.join(", ")}], this build knows [${known.join(", ")}]`,
    });
  }

  if (!options.evmSource) {
    out.push({
      kind: "ok",
      seq,
      detail: `${entry.outcome} po#${entry.po} ${entry.codes.join(",") || "clean"} (journal only)`,
    });
    return out;
  }

  const chain = await options.evmSource({ invoiceHash: entry.inv, txHash: entry.evm.tx });
  if (!chain) {
    out.push({ kind: "evm_missing", seq, invoiceHash: entry.inv });
    return out;
  }

  if (chain.outcome !== entry.outcome) {
    out.push({ kind: "field_disagrees", seq, field: "outcome", chain: chain.outcome, journal: entry.outcome });
  }
  if (chain.reasonMask !== mask) {
    out.push({
      kind: "field_disagrees",
      seq,
      field: "reasonMask",
      chain: `${chain.reasonMask} [${codesOf(chain.reasonMask).join(",")}]`,
      journal: `${mask} [${entry.codes.join(",")}]`,
    });
  }
  if (chain.invQty !== BigInt(entry.qty.inv)) {
    out.push({ kind: "field_disagrees", seq, field: "invoicedQty", chain: chain.invQty.toString(), journal: entry.qty.inv });
  }
  if (chain.recvQty !== BigInt(entry.qty.recv)) {
    out.push({ kind: "field_disagrees", seq, field: "receivedQty", chain: chain.recvQty.toString(), journal: entry.qty.recv });
  }

  // The actual binding: recompute from the chain's fields with gate-core.
  const input: DigestInput = {
    chainId: BigInt(options.chainId),
    gate: options.gateAddress,
    poId: chain.poId,
    invoiceHash: chain.invoiceHash,
    outcome: chain.outcome,
    reasonMask: chain.reasonMask,
    invQty: chain.invQty,
    recvQty: chain.recvQty,
    invUnitPrice: chain.invUnitPrice,
    poUnitPrice: chain.poUnitPrice,
    creatorPersonId: chain.creatorPersonId,
    receiverPersonId: chain.receiverPersonId,
    approverPersonId: chain.approverPersonId,
    nonce: chain.nonce,
  };
  const recomputed = journalDigest(input, options.keccak256);

  const sameAsJournal = recomputed.toLowerCase() === entry.dig.toLowerCase();
  const sameAsChain = recomputed.toLowerCase() === chain.journalDigest.toLowerCase();

  if (!sameAsJournal || !sameAsChain) {
    out.push({
      kind: "digest_mismatch",
      seq,
      recomputed,
      journal: entry.dig,
      onChain: chain.journalDigest,
    });
  }

  if (out.length === 0) {
    out.push({
      kind: "ok",
      seq,
      detail: `${entry.outcome} po#${entry.po} ${entry.codes.join(",") || "clean"} · tx ${chain.txHash.slice(0, 10)}… · digest recomputed and matched`,
    });
  }

  return out;
}

export function formatReport(report: ReplayReport): string {
  const lines: string[] = [
    `topic     ${report.topicId}`,
    `entries   ${report.entries}  (${report.decisions} decisions)`,
    "",
  ];

  for (const f of report.findings) {
    switch (f.kind) {
      case "ok":
        lines.push(`  OK    #${f.seq}  ${f.detail}`);
        break;
      case "skipped":
        lines.push(`  skip  #${f.seq}  ${f.reason}`);
        break;
      case "evm_missing":
        lines.push(`  FAIL  #${f.seq}  no EVM decision found for ${f.invoiceHash}`);
        break;
      case "digest_mismatch":
        lines.push(`  FAIL  #${f.seq}  digest mismatch`);
        lines.push(`        recomputed ${f.recomputed}`);
        lines.push(`        journal    ${f.journal}`);
        lines.push(`        on chain   ${f.onChain}`);
        break;
      case "field_disagrees":
        lines.push(`  FAIL  #${f.seq}  ${f.field}: chain=${f.chain} journal=${f.journal}`);
        break;
      case "unknown_code":
        lines.push(`  FAIL  #${f.seq}  ${f.detail}`);
        break;
      case "ledger_ok":
        lines.push(`  OK    ledger  ${f.detail}`);
        break;
      case "sequence_gap":
        lines.push(`  FAIL  sequence gap: expected #${f.expected}, found #${f.found}`);
        break;
      case "time_not_increasing":
        lines.push(`  FAIL  #${f.seq}  consensus time ${f.found} is not after ${f.previous}`);
        break;
      case "foreign_payer":
        lines.push(`  FAIL  #${f.seq}  paid by ${f.payer}, not ${f.expected}`);
        break;
      case "chunked":
        lines.push(`  FAIL  #${f.seq}  chunked message: this journal never chunks`);
        break;
      case "topic_open":
      case "topic_mutable":
        lines.push(`  FAIL  topic  ${f.detail}`);
        break;
      case "topic_memo":
        lines.push(`  FAIL  topic  memo is "${f.memo}", expected "${f.expected}"`);
        break;
      case "topic_unreadable":
        lines.push(`  skip  topic  could not read the topic's settings: ${f.reason}`);
        break;
    }
  }

  lines.push("", report.ok ? "OK - journal and chain agree" : "FAILED - see above");
  return lines.join("\n");
}
