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
import { decodeTopic, readTopic, type ReadOptions } from "./mirror.ts";

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
};

/** Looks up what the chain logged for an invoice hash. */
export type EvmSource = (
  invoiceHash: string,
) => Promise<EvmDecision | null> | EvmDecision | null;

export type ReplayFinding =
  | { kind: "ok"; seq: number; detail: string }
  | { kind: "evm_missing"; seq: number; invoiceHash: string }
  | { kind: "digest_mismatch"; seq: number; recomputed: string; journal: string; onChain: string }
  | { kind: "field_disagrees"; seq: number; field: string; chain: string; journal: string }
  | { kind: "unknown_code"; seq: number; detail: string }
  | { kind: "skipped"; seq: number; reason: string };

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
};

export async function replay(topicId: string, options: ReplayOptions): Promise<ReplayReport> {
  const messages = await readTopic(topicId, options);
  const { records, skipped } = decodeTopic(messages);

  const findings: ReplayFinding[] = skipped.map((s) => ({
    kind: "skipped" as const,
    seq: s.sequenceNumber,
    reason: s.reason,
  }));

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
    ok: findings.every((f) => f.kind === "ok" || f.kind === "skipped"),
  };
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

  const chain = await options.evmSource(entry.inv);
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
    }
  }

  lines.push("", report.ok ? "OK - journal and chain agree" : "FAILED - see above");
  return lines.join("\n");
}
