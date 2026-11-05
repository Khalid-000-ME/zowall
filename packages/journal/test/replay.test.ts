/**
 * The replay has to fail when someone edits the record. A reconciliation that
 * only ever prints OK proves nothing, so these tests tamper on purpose.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { encodeDecision, type Bytes32 } from "@zowall/gate-core";
import { MAX_HCS_MESSAGE_BYTES, serialize, type DecisionEntry } from "../src/entry.ts";
import { replay, type EvmDecision } from "../src/replay.ts";
import type { MirrorMessage } from "../src/mirror.ts";

const GATE = "0x00000000000000000000000000000000000000Ba5e" as const;
const CHAIN = 1874;
const INV = `0x${"1a".repeat(32)}` as Bytes32;
const ALICE = `0x${"a1".repeat(32)}` as Bytes32;
const BOB = `0x${"b2".repeat(32)}` as Bytes32;
const ZERO = `0x${"00".repeat(32)}` as Bytes32;

/** Deterministic stand-in for keccak256; mixes the whole input. */
const hash = (data: `0x${string}`): `0x${string}` => {
  let h = 0xcbf29ce4n;
  for (const ch of data.slice(2)) {
    h = ((h ^ BigInt(ch.charCodeAt(0))) * 0x100000001b3n) & ((1n << 256n) - 1n);
  }
  return `0x${h.toString(16).padStart(64, "0")}`;
};

const chainDecision: EvmDecision = {
  poId: 17n,
  invoiceHash: INV,
  outcome: "HELD",
  reasonMask: (1 << 9) | (1 << 10), // QTY_OVER_RECEIVED | PRICE_OVER_TOLERANCE
  invQty: 120n,
  recvQty: 100n,
  invUnitPrice: 46_000_000n,
  poUnitPrice: 40_000_000n,
  creatorPersonId: ALICE,
  receiverPersonId: BOB,
  approverPersonId: ZERO,
  nonce: 1n,
  journalDigest: ZERO,
  txHash: "0xabc1230000000000000000000000000000000000000000000000000000000000",
  blockNumber: 123_456,
};

function trueDigest(): `0x${string}` {
  return hash(
    encodeDecision({
      chainId: BigInt(CHAIN),
      gate: GATE,
      poId: chainDecision.poId,
      invoiceHash: chainDecision.invoiceHash,
      outcome: chainDecision.outcome,
      reasonMask: chainDecision.reasonMask,
      invQty: chainDecision.invQty,
      recvQty: chainDecision.recvQty,
      invUnitPrice: chainDecision.invUnitPrice,
      poUnitPrice: chainDecision.poUnitPrice,
      creatorPersonId: chainDecision.creatorPersonId,
      receiverPersonId: chainDecision.receiverPersonId,
      approverPersonId: chainDecision.approverPersonId,
      nonce: chainDecision.nonce,
    }),
  );
}

function entry(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    v: 1,
    kind: "decision",
    po: 17,
    inv: INV,
    outcome: "HELD",
    codes: ["QTY_OVER_RECEIVED", "PRICE_OVER_TOLERANCE"],
    qty: { inv: "120", recv: "100" },
    unit: { inv: "46000000", po: "40000000" },
    evm: { chain: CHAIN, tx: chainDecision.txHash, block: 123_456 },
    dig: trueDigest(),
    at: 1_789_299_716_345,
    ...overrides,
  };
}

/** A mirror node that serves exactly the entries a test hands it. */
function fakeMirror(entries: DecisionEntry[]): typeof fetch {
  const messages: MirrorMessage[] = entries.map((e, i) => ({
    chunk_info: null,
    consensus_timestamp: `1789299716.00000000${i}`,
    message: Buffer.from(serialize(e), "utf8").toString("base64"),
    payer_account_id: "0.0.6503308",
    running_hash: `0x${"ab".repeat(24)}`,
    running_hash_version: 3,
    sequence_number: i + 1,
    topic_id: "0.0.999",
  }));

  return (async () =>
    new Response(JSON.stringify({ messages, links: { next: null } }), {
      status: 200,
    })) as unknown as typeof fetch;
}

const options = (entries: DecisionEntry[], evm: EvmDecision | null = chainDecision) => ({
  keccak256: hash,
  chainId: CHAIN,
  gateAddress: GATE,
  fetchImpl: fakeMirror(entries),
  evmSource: () => (evm ? { ...evm, journalDigest: trueDigest() } : null),
});

test("a journal that matches the chain replays OK", async () => {
  const report = await replay("0.0.999", options([entry()]));
  assert.equal(report.ok, true, JSON.stringify(report.findings));
  assert.equal(report.decisions, 1);
  assert.equal(report.findings[0]?.kind, "ok");
});

test("editing the digest in the journal is caught", async () => {
  const report = await replay("0.0.999", options([entry({ dig: `0x${"ff".repeat(32)}` })]));
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((f) => f.kind === "digest_mismatch"));
});

test("softening a refusal in the journal is caught", async () => {
  // the record says PAID, the chain says HELD
  const report = await replay("0.0.999", options([entry({ outcome: "PAID", codes: [] })]));
  assert.equal(report.ok, false);
  assert.ok(
    report.findings.some((f) => f.kind === "field_disagrees" && f.field === "outcome"),
    "outcome disagreement not reported",
  );
});

test("quietly dropping a reason code is caught", async () => {
  const report = await replay("0.0.999", options([entry({ codes: ["PRICE_OVER_TOLERANCE"] })]));
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((f) => f.kind === "field_disagrees" && f.field === "reasonMask"));
});

test("restating the quantities in the journal is caught", async () => {
  const report = await replay("0.0.999", options([entry({ qty: { inv: "100", recv: "100" } })]));
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((f) => f.kind === "field_disagrees" && f.field === "invoicedQty"));
});

test("one invoice decided twice gives two distinct entries, not one", async () => {
  // Submit an invoice, get PAID. Submit the identical bytes again, get
  // DUPLICATE_INVOICE. Same invoice hash, two different decisions - so a
  // lookup keyed on the invoice hash loses one of them.
  const paidTx = "0xaaa1230000000000000000000000000000000000000000000000000000000000";
  const dupTx = "0xbbb4560000000000000000000000000000000000000000000000000000000000";

  const paid: EvmDecision = { ...chainDecision, outcome: "PAID", reasonMask: 0, txHash: paidTx };
  const dup: EvmDecision = {
    ...chainDecision,
    outcome: "REJECTED",
    reasonMask: 1 << 5, // DUPLICATE_INVOICE
    txHash: dupTx,
  };

  const digestFor = (d: EvmDecision) =>
    hash(
      encodeDecision({
        chainId: BigInt(CHAIN),
        gate: GATE,
        poId: d.poId,
        invoiceHash: d.invoiceHash,
        outcome: d.outcome,
        reasonMask: d.reasonMask,
        invQty: d.invQty,
        recvQty: d.recvQty,
        invUnitPrice: d.invUnitPrice,
        poUnitPrice: d.poUnitPrice,
        creatorPersonId: d.creatorPersonId,
        receiverPersonId: d.receiverPersonId,
        approverPersonId: d.approverPersonId,
        nonce: d.nonce,
      }),
    );

  const entries = [
    entry({ outcome: "PAID", codes: [], evm: { chain: CHAIN, tx: paidTx, block: 1 }, dig: digestFor(paid) }),
    entry({
      outcome: "REJECTED",
      codes: ["DUPLICATE_INVOICE"],
      evm: { chain: CHAIN, tx: dupTx, block: 2 },
      dig: digestFor(dup),
    }),
  ];

  const byTx = new Map([
    [paidTx, { ...paid, journalDigest: digestFor(paid) }],
    [dupTx, { ...dup, journalDigest: digestFor(dup) }],
  ]);

  const report = await replay("0.0.999", {
    keccak256: hash,
    chainId: CHAIN,
    gateAddress: GATE,
    fetchImpl: fakeMirror(entries),
    evmSource: (ref) => byTx.get(ref.txHash) ?? null,
  });

  assert.equal(report.decisions, 2);
  assert.equal(report.ok, true, JSON.stringify(report.findings));
});

test("an entry with no decision on chain at all is caught", async () => {
  const report = await replay("0.0.999", options([entry()], null));
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((f) => f.kind === "evm_missing"));
});

test("a reason code this build does not know is reported, not dropped", async () => {
  const report = await replay(
    "0.0.999",
    options([entry({ codes: ["QTY_OVER_RECEIVED", "PRICE_OVER_TOLERANCE", "MADE_UP" as never] })]),
  );
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((f) => f.kind === "unknown_code"));
});

test("junk another account submitted to the public topic is skipped, not fatal", async () => {
  const fetchImpl = (async () =>
    new Response(
      JSON.stringify({
        messages: [
          {
            chunk_info: null,
            consensus_timestamp: "1789299716.1",
            message: Buffer.from("hello from a stranger", "utf8").toString("base64"),
            payer_account_id: "0.0.1",
            running_hash: "0x00",
            running_hash_version: 3,
            sequence_number: 1,
            topic_id: "0.0.999",
          },
        ],
        links: { next: null },
      }),
      { status: 200 },
    )) as unknown as typeof fetch;

  const report = await replay("0.0.999", {
    keccak256: hash,
    chainId: CHAIN,
    gateAddress: GATE,
    fetchImpl,
  });
  assert.equal(report.ok, true);
  assert.equal(report.findings[0]?.kind, "skipped");
});

test("an entry that would need chunking is refused at write time", () => {
  const huge = entry({ inv: `0x${"ab".repeat(600)}` as Bytes32 });
  assert.throws(() => serialize(huge), /over the 1024-byte HCS limit/);
  assert.ok(serialize(entry()).length < MAX_HCS_MESSAGE_BYTES);
});
