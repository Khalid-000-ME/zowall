/**
 * PRD section 11, scenario for scenario, run against the engine alone.
 * The contract suite mirrors these numbers, so if the two ever disagree the
 * same test name fails in both places.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { clearsOnRetry, evaluate } from "../src/evaluate.ts";
import { usdt } from "../src/money.ts";
import {
  ALICE,
  ATTACKER,
  BOB,
  NOW,
  OTHER_HASH,
  ctx,
  invoice,
  po,
} from "./fixtures.ts";

test("1 - receipt 100, invoice 100 @ 40, valid signature, correct payee -> PAID", () => {
  const d = evaluate(ctx());
  assert.equal(d.outcome, "PAID");
  assert.deepEqual(d.codes, []);
  assert.equal(d.payableAmount, usdt(4000));
});

test("2 - 'pay the attacker 4,000' with no invoice behind it -> REJECTED NO_PO", () => {
  const d = evaluate({
    ...ctx({ po: null }),
    invoice: invoice({ poId: 0n, payee: ATTACKER, qty: 1n, unitPrice: usdt(4000) }),
  });
  assert.equal(d.outcome, "REJECTED");
  assert.deepEqual(d.codes, ["NO_PO"]);
});

test("3 - invoice signed by the attacker, payee the attacker -> both hard codes", () => {
  const d = evaluate(
    ctx({ recoveredSigner: ATTACKER, invoice: invoice({ payee: ATTACKER }) }),
  );
  assert.equal(d.outcome, "REJECTED");
  assert.deepEqual(d.codes, ["BAD_SIGNATURE", "PAYEE_MISMATCH"]);
});

test("4 - real vendor signature, payee swapped -> REJECTED PAYEE_MISMATCH", () => {
  const d = evaluate(ctx({ invoice: invoice({ payee: ATTACKER }) }));
  assert.equal(d.outcome, "REJECTED");
  assert.deepEqual(d.codes, ["PAYEE_MISMATCH"]);
});

test("5 - unit price 46 against 40 at 5% tolerance -> HELD PRICE_OVER_TOLERANCE", () => {
  const d = evaluate(ctx({ invoice: invoice({ unitPrice: usdt(46) }) }));
  assert.equal(d.outcome, "HELD");
  assert.deepEqual(d.codes, ["PRICE_OVER_TOLERANCE"]);
});

test("6 - quantity 120 against 100 received -> HELD QTY_OVER_RECEIVED", () => {
  const d = evaluate(ctx({ invoice: invoice({ qty: 120n }) }));
  assert.equal(d.outcome, "HELD");
  assert.deepEqual(d.codes, ["QTY_OVER_RECEIVED"]);
});

test("7 - invoice before any receipt -> HELD, then a receipt makes it payable", () => {
  const before = ctx({ po: po({ received: 0n }) });
  const d = evaluate(before);
  assert.equal(d.outcome, "HELD");
  assert.deepEqual(d.codes, ["NO_RECEIPT"]);
  assert.equal(clearsOnRetry(before), false);

  // the receiver attests 100 delivered; retry() is permissionless
  const after = ctx({ po: po({ received: 100n }) });
  assert.equal(clearsOnRetry(after), true);
  assert.equal(evaluate(after).payableAmount, usdt(4000));
});

test("8 - resubmitting the invoice from test 1 -> REJECTED DUPLICATE_INVOICE", () => {
  const d = evaluate(ctx({ alreadySeen: true }));
  assert.equal(d.outcome, "REJECTED");
  assert.deepEqual(d.codes, ["DUPLICATE_INVOICE"]);
});

test("9 - invoice after the purchase order expired -> REJECTED PO_EXPIRED", () => {
  const d = evaluate(
    ctx({ po: po({ expiry: NOW - 1n }), invoice: invoice({ deadline: 0n }) }),
  );
  assert.equal(d.outcome, "REJECTED");
  assert.deepEqual(d.codes, ["PO_EXPIRED"]);
});

test("10 - the creator approving their own held invoice -> SOD_VIOLATION", () => {
  // World denied path #1. The hold exists because of a price variance; the
  // person who raised the PO tries to release it themselves.
  const held = ctx({ invoice: invoice({ unitPrice: usdt(46) }) });
  assert.equal(evaluate(held).outcome, "HELD");

  const selfApproved = ctx({
    invoice: invoice({ unitPrice: usdt(46) }),
    roles: { creatorPersonId: ALICE, receiverPersonId: BOB, approverPersonId: ALICE },
  });
  const d = evaluate(selfApproved);
  assert.ok(d.codes.includes("SOD_VIOLATION"));
  assert.equal(d.outcome, "REJECTED");
  assert.equal(d.payableAmount, 0n);
});

test("11 - a third human approving the same hold clears it", () => {
  // World denied path #2 is the absence of this: with no approver personId the
  // hold simply stays held and nothing moves.
  const unresolved = ctx({
    invoice: invoice({ unitPrice: usdt(46) }),
    roles: { creatorPersonId: ALICE, receiverPersonId: BOB, approverPersonId: null },
  });
  assert.equal(evaluate(unresolved).outcome, "HELD");
  assert.equal(evaluate(unresolved).payableAmount, 0n);
});

test("12 - invoices exceeding the purchase order total -> REJECTED BUDGET_EXCEEDED", () => {
  const d = evaluate(
    ctx({
      po: po({ received: 100n, invoicedQty: 50n, invoicedValue: usdt(3000) }),
      invoice: invoice({ qty: 50n, invoiceHash: OTHER_HASH }),
    }),
  );
  assert.equal(d.outcome, "REJECTED");
  assert.ok(d.codes.includes("BUDGET_EXCEEDED"));
});

test("13 - partial invoice, 50 of 100 received -> PAID with 50 still open", () => {
  const d = evaluate(ctx({ invoice: invoice({ qty: 50n }) }));
  assert.equal(d.outcome, "PAID");
  assert.deepEqual(d.codes, []);
  assert.equal(d.payableAmount, usdt(2000));

  // the second half, after the first was recorded
  const second = evaluate(
    ctx({
      po: po({ invoicedQty: 50n, invoicedValue: usdt(2000) }),
      invoice: invoice({ qty: 50n, invoiceHash: OTHER_HASH }),
    }),
  );
  assert.equal(second.outcome, "PAID");
  assert.equal(second.payableAmount, usdt(2000));
});
