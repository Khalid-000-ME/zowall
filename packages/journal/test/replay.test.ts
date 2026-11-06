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
  // The fake mirror serves messages for every URL, so it cannot answer a topic-info
  // request. Topic settings have their own tests below.
  checkTopic: false,
  evmSource: () => (evm ? { ...evm, journalDigest: trueDigest() } : null),
});

test("a journal that matches the chain replays OK", async () => {
  const report = await replay("0.0.999", options([entry()]));
  assert.equal(report.ok, true, JSON.stringify(report.findings));
  assert.equal(report.decisions, 1);
  assert.ok(report.findings.some((f) => f.kind === "ok"));
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
    checkTopic: false,
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
    checkTopic: false,
  });
  assert.equal(report.ok, true);
  assert.ok(report.findings.some((f) => f.kind === "skipped"));
});

test("an entry that would need chunking is refused at write time", () => {
  const huge = entry({ inv: `0x${"ab".repeat(600)}` as Bytes32 });
  assert.throws(() => serialize(huge), /over the 1024-byte HCS limit/);
  assert.ok(serialize(entry()).length < MAX_HCS_MESSAGE_BYTES);
});

/* ------------------------------------------- the ledger record itself -- */

import { checkLedger } from "../src/replay.ts";

const msg = (seq: number, ts: string, payer = "0.0.6503308", chunk: unknown = null): MirrorMessage => ({
  chunk_info: chunk,
  consensus_timestamp: ts,
  message: "",
  payer_account_id: payer,
  running_hash: "",
  running_hash_version: 3,
  sequence_number: seq,
  topic_id: "0.0.999",
});

test("a topic with contiguous sequence numbers and rising times is clean", () => {
  const f = checkLedger([msg(1, "10.000000001"), msg(2, "10.000000002"), msg(3, "11.000000000")]);
  assert.deepEqual(f.map((x) => x.kind), ["ledger_ok"]);
});

test("a dropped message shows up as a gap in the sequence", () => {
  const f = checkLedger([msg(1, "10.000000001"), msg(3, "10.000000003")]);
  assert.ok(f.some((x) => x.kind === "sequence_gap" && x.expected === 2 && x.found === 3));
});

test("a topic read from the middle is not mistaken for a whole one", () => {
  const f = checkLedger([msg(5, "10.000000005")]);
  assert.ok(f.some((x) => x.kind === "sequence_gap" && x.expected === 1));
});

test("a reordered message is caught by its consensus time", () => {
  const f = checkLedger([msg(1, "10.000000009"), msg(2, "10.000000002")]);
  assert.ok(f.some((x) => x.kind === "time_not_increasing" && x.seq === 2));
});

test("a message paid for by anyone else was submitted by someone else", () => {
  const f = checkLedger([msg(1, "10.000000001"), msg(2, "10.000000002", "0.0.42")], "0.0.6503308");
  assert.ok(f.some((x) => x.kind === "foreign_payer" && x.seq === 2 && x.payer === "0.0.42"));
});

test("without an expected payer the payer is not judged", () => {
  const f = checkLedger([msg(1, "10.000000001", "0.0.42")]);
  assert.deepEqual(f.map((x) => x.kind), ["ledger_ok"]);
});

test("an unchunked message is not flagged, though the mirror still reports chunk info for it", () => {
  const f = checkLedger([msg(1, "10.000000001", "0.0.6503308", { number: 1, total: 1 })]);
  assert.deepEqual(f.map((x) => x.kind), ["ledger_ok"]);
});

test("a chunked message is flagged, because this journal never chunks", () => {
  const f = checkLedger([msg(1, "10.000000001", "0.0.6503308", { number: 1, total: 2 })]);
  assert.ok(f.some((x) => x.kind === "chunked"));
});

/* ------------------------------------------------------ the topic itself -- */

function topicFetch(info: Record<string, unknown>): typeof fetch {
  return (async (url: string) =>
    String(url).includes("/messages")
      ? new Response(JSON.stringify({ messages: [], links: { next: null } }), { status: 200 })
      : new Response(JSON.stringify(info), { status: 200 })) as unknown as typeof fetch;
}

const GOOD_MEMO = `zowall journal v2 chain=${CHAIN} gate=${GATE.toLowerCase()}`;
const topicOptions = (info: Record<string, unknown>) => ({
  keccak256: hash,
  chainId: CHAIN,
  gateAddress: GATE,
  fetchImpl: topicFetch(info),
});

test("a closed, immutable topic that names this gate passes", async () => {
  const r = await replay("0.0.999", topicOptions({ memo: GOOD_MEMO, admin_key: null, submit_key: { key: "ab" }, auto_renew_account: "0.0.1" }));
  assert.equal(r.ok, true, JSON.stringify(r.findings));
});

test("a topic anyone can write to is refused", async () => {
  const r = await replay("0.0.999", topicOptions({ memo: GOOD_MEMO, admin_key: null, submit_key: null }));
  assert.equal(r.ok, false);
  assert.ok(r.findings.some((f) => f.kind === "topic_open"));
});

test("a topic that still has an admin key is refused", async () => {
  const r = await replay("0.0.999", topicOptions({ memo: GOOD_MEMO, admin_key: { key: "ab" }, submit_key: { key: "cd" } }));
  assert.equal(r.ok, false);
  assert.ok(r.findings.some((f) => f.kind === "topic_mutable"));
});

test("a topic whose memo names a different gate is not this journal", async () => {
  const r = await replay("0.0.999", topicOptions({ memo: "zowall journal v2 chain=1874 gate=0xdeadbeef", admin_key: null, submit_key: { key: "cd" } }));
  assert.equal(r.ok, false);
  assert.ok(r.findings.some((f) => f.kind === "topic_memo"));
});

/* ----------------------------------------------------- reading the mirror -- */

import { readTopic } from "../src/mirror.ts";

test("a mirror that answers 503 twice is retried and then read", async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return calls < 3
      ? new Response("busy", { status: 503 })
      : new Response(JSON.stringify({ messages: [msg(1, "10.000000001")], links: { next: null } }), { status: 200 });
  }) as unknown as typeof fetch;

  const out = await readTopic("0.0.999", { fetchImpl, retries: 4 });
  assert.equal(out.length, 1);
  assert.equal(calls, 3);
});

test("a dead mirror falls through to the next, read from the start", async () => {
  const fetchImpl = (async (url: string) =>
    String(url).startsWith("https://dead")
      ? new Response("down", { status: 502 })
      : new Response(JSON.stringify({ messages: [msg(1, "10.000000001")], links: { next: null } }), {
          status: 200,
        })) as unknown as typeof fetch;

  const out = await readTopic("0.0.999", {
    mirrorUrl: "https://dead.example",
    fallbackMirrors: ["https://alive.example"],
    fetchImpl,
    retries: 1,
  });
  assert.equal(out.length, 1);
});

test("a 404 is not retried, because asking again will not change it", async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response("no such topic", { status: 404 });
  }) as unknown as typeof fetch;

  await assert.rejects(readTopic("0.0.999", { fetchImpl, retries: 4 }), /404/);
  assert.equal(calls, 1);
});
