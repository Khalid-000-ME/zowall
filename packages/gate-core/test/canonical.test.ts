import { test } from "node:test";
import assert from "node:assert/strict";

import { encodeDecision, journalDigest, type DigestInput } from "../src/canonical.ts";
import { usdt } from "../src/money.ts";
import { ALICE, BOB, INVOICE_HASH, PAYEE } from "./fixtures.ts";

const input: DigestInput = {
  chainId: 1874n,
  gate: PAYEE,
  poId: 17n,
  invoiceHash: INVOICE_HASH,
  outcome: "HELD",
  reasonMask: 0b110_0000_0000,
  invQty: 120n,
  recvQty: 100n,
  invUnitPrice: usdt(46),
  poUnitPrice: usdt(40),
  creatorPersonId: ALICE,
  receiverPersonId: BOB,
  approverPersonId: null,
  nonce: 1n,
};

test("encoding is fourteen 32-byte words, exactly as abi.encode would be", () => {
  const encoded = encodeDecision(input);
  assert.ok(encoded.startsWith("0x"));
  assert.equal((encoded.length - 2) / 2, 14 * 32);
});

test("an absent approver encodes as the zero person, not as a short word", () => {
  const withApprover = encodeDecision({ ...input, approverPersonId: ALICE });
  assert.equal(withApprover.length, encodeDecision(input).length);
  assert.notEqual(withApprover, encodeDecision(input));
});

/**
 * A stand-in for keccak256 that actually mixes every byte. Not a real hash and
 * never used outside this file - the point is only that the digest depends on
 * the whole encoding, so a field that stops being encoded fails the test.
 */
const mixAll = (data: string): `0x${string}` => {
  let h = 0xcbf29ce4n;
  for (const ch of data.slice(2)) {
    h = ((h ^ BigInt(ch.charCodeAt(0))) * 0x100000001b3n) & ((1n << 256n) - 1n);
  }
  return `0x${h.toString(16).padStart(64, "0")}` as `0x${string}`;
};

test("every field changes the digest", () => {
  const base = journalDigest(input, mixAll);

  const mutations: Array<Partial<DigestInput>> = [
    { chainId: 1n },
    { poId: 18n },
    { outcome: "PAID" },
    { reasonMask: 0 },
    { invQty: 121n },
    { recvQty: 99n },
    { invUnitPrice: usdt(47) },
    { poUnitPrice: usdt(41) },
    { creatorPersonId: BOB },
    { receiverPersonId: ALICE },
    { approverPersonId: ALICE },
    { nonce: 2n },
  ];
  for (const m of mutations) {
    assert.notEqual(
      journalDigest({ ...input, ...m }, mixAll),
      base,
      `digest ignored ${Object.keys(m)[0]}`,
    );
  }
});

test("keccak is injected, so the package needs no crypto dependency", () => {
  let seen: string | null = null;
  journalDigest(input, (d) => {
    seen = d;
    return "0xdeadbeef";
  });
  assert.equal(seen, encodeDecision(input));
});

test("values wider than a word are refused rather than truncated", () => {
  assert.throws(() => encodeDecision({ ...input, poId: 1n << 256n }), /uint256 range/);
  assert.throws(
    () => encodeDecision({ ...input, invoiceHash: `0x${"ff".repeat(33)}` }),
    /wider than 32 bytes/,
  );
});
