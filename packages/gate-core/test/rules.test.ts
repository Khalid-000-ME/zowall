/** One test per reason code. If a code has no test here, it does not exist. */

import { test } from "node:test";
import assert from "node:assert/strict";

import { REASON_CODES, SEVERITY, codesOf, maskOf } from "../src/codes.ts";
import { evaluate } from "../src/evaluate.ts";
import { usdt } from "../src/money.ts";
import { ALICE, ATTACKER, BOB, NOW, ctx, invoice, po } from "./fixtures.ts";

const codes = (c: Parameters<typeof evaluate>[0]) => evaluate(c).codes;

test("NO_PO - invoice references a purchase order that does not exist", () => {
  const d = evaluate(ctx({ po: null }));
  assert.deepEqual(d.codes, ["NO_PO"]);
  assert.equal(d.outcome, "REJECTED");
  assert.equal(d.payableAmount, 0n);
});

test("NO_PO - a cancelled purchase order is not an open one", () => {
  assert.ok(codes(ctx({ po: po({ status: "Cancelled" }) })).includes("NO_PO"));
});

test("BAD_SIGNATURE - signer is not the vendor key on the purchase order", () => {
  const d = evaluate(ctx({ recoveredSigner: ATTACKER }));
  assert.ok(d.codes.includes("BAD_SIGNATURE"));
  assert.equal(d.outcome, "REJECTED");
});

test("BAD_SIGNATURE - signature could not be recovered at all", () => {
  assert.ok(codes(ctx({ recoveredSigner: null })).includes("BAD_SIGNATURE"));
});

test("BAD_SIGNATURE - the signed payload's deadline has passed", () => {
  assert.ok(codes(ctx({ now: NOW + 7_200n })).includes("BAD_SIGNATURE"));
});

test("PAYEE_MISMATCH - payment points somewhere the purchase order never named", () => {
  const d = evaluate(ctx({ invoice: invoice({ payee: ATTACKER }) }));
  assert.ok(d.codes.includes("PAYEE_MISMATCH"));
  assert.equal(d.outcome, "REJECTED");
});

test("PO_EXPIRED - invoice arrived after the purchase order expired", () => {
  const d = evaluate(
    ctx({
      po: po({ expiry: NOW - 1n }),
      invoice: invoice({ deadline: 0n }),
    }),
  );
  assert.deepEqual(d.codes, ["PO_EXPIRED"]);
});

test("PO_CLOSED - purchase order is fully invoiced", () => {
  const d = evaluate(ctx({ po: po({ invoicedQty: 100n, invoicedValue: usdt(4000) }) }));
  assert.ok(d.codes.includes("PO_CLOSED"));
});

test("DUPLICATE_INVOICE - the same invoice hash was decided before", () => {
  const d = evaluate(ctx({ alreadySeen: true }));
  assert.deepEqual(d.codes, ["DUPLICATE_INVOICE"]);
  assert.equal(d.outcome, "REJECTED");
});

test("BUDGET_EXCEEDED - an approved over-priced hold leaves no room for the rest", () => {
  // PO: 100 units @ 40 = 4,000 encumbered.
  // A first invoice of 50 units was approved by override at 60 -> 3,000 paid.
  // The remaining 50 units at the agreed 40 would need 2,000, and only 1,000
  // of the reservation is left.
  const d = evaluate(
    ctx({
      po: po({ received: 100n, invoicedQty: 50n, invoicedValue: usdt(3000) }),
      invoice: invoice({ qty: 50n }),
    }),
  );
  assert.ok(d.codes.includes("BUDGET_EXCEEDED"));
  assert.equal(d.outcome, "REJECTED");
});

test("BUDGET_EXCEEDED yields to QTY_OVER_RECEIVED - most specific code wins", () => {
  // 120 units on a 100-unit PO also busts the total in value terms. It must
  // still park for a human rather than hard-reject, or the exception queue
  // never sees the case it exists for.
  const d = evaluate(ctx({ po: po({ received: 100n }), invoice: invoice({ qty: 120n }) }));
  assert.deepEqual(d.codes, ["QTY_OVER_RECEIVED"]);
  assert.equal(d.outcome, "HELD");
});

test("SOD_VIOLATION - one human holds two roles on the same purchase order", () => {
  const d = evaluate(
    ctx({ roles: { creatorPersonId: ALICE, receiverPersonId: ALICE, approverPersonId: null } }),
  );
  assert.ok(d.codes.includes("SOD_VIOLATION"));
  assert.equal(d.outcome, "REJECTED");
});

test("SOD_VIOLATION - three different humans pass", () => {
  assert.equal(evaluate(ctx()).outcome, "PAID");
});

test("NO_RECEIPT - nothing attested as delivered yet", () => {
  const d = evaluate(ctx({ po: po({ received: 0n }) }));
  assert.deepEqual(d.codes, ["NO_RECEIPT"]);
  assert.equal(d.outcome, "HELD");
});

test("NO_RECEIPT suppresses QTY_OVER_RECEIVED - one fact, one code", () => {
  const d = evaluate(ctx({ po: po({ received: 0n }) }));
  assert.ok(!d.codes.includes("QTY_OVER_RECEIVED"));
});

test("QTY_OVER_RECEIVED - invoiced more units than were received", () => {
  const d = evaluate(ctx({ po: po({ received: 100n }), invoice: invoice({ qty: 120n }) }));
  assert.ok(d.codes.includes("QTY_OVER_RECEIVED"));
  assert.equal(d.outcome, "HELD");
});

test("QTY_OVER_RECEIVED - respects the quantity tolerance", () => {
  const within = ctx({
    po: po({ received: 100n, qtyTolBps: 1000 }),
    invoice: invoice({ qty: 110n }),
  });
  assert.ok(!codes(within).includes("QTY_OVER_RECEIVED"));
});

test("PRICE_OVER_TOLERANCE - unit price above the agreed price plus tolerance", () => {
  const d = evaluate(ctx({ invoice: invoice({ unitPrice: usdt(46) }) }));
  assert.deepEqual(d.codes, ["PRICE_OVER_TOLERANCE"]);
  assert.equal(d.outcome, "HELD");
});

test("PRICE_OVER_TOLERANCE - a price exactly on the tolerance ceiling passes", () => {
  const d = evaluate(ctx({ invoice: invoice({ unitPrice: usdt(42) }) }));
  assert.equal(d.outcome, "PAID");
});

test("every reason code has a severity and a round-trips through the bitmask", () => {
  for (const code of REASON_CODES) {
    assert.ok(SEVERITY[code] === "hard" || SEVERITY[code] === "soft", code);
    assert.deepEqual(codesOf(maskOf([code])), [code]);
  }
  assert.deepEqual(codesOf(maskOf(REASON_CODES)), [...REASON_CODES]);
});

test("every failing code is returned, not just the first", () => {
  const d = evaluate(
    ctx({
      recoveredSigner: ATTACKER,
      invoice: invoice({ payee: ATTACKER }),
      roles: { creatorPersonId: ALICE, receiverPersonId: BOB, approverPersonId: ALICE },
    }),
  );
  assert.deepEqual(d.codes.sort(), ["BAD_SIGNATURE", "PAYEE_MISMATCH", "SOD_VIOLATION"].sort());
});
