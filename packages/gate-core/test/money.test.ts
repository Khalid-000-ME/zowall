import { test } from "node:test";
import assert from "node:assert/strict";

import { formatUsdt, lineTotal, parseUsdt, usdt, withTolerance } from "../src/money.ts";

test("USDT is six decimals, not eighteen", () => {
  assert.equal(usdt(40), 40_000_000n);
  assert.equal(usdt("0.000001"), 1n);
  assert.equal(usdt("1234.5"), 1_234_500_000n);
});

test("parse rejects anything it cannot represent exactly", () => {
  assert.throws(() => parseUsdt("1.0000001"), /decimal places/);
  assert.throws(() => parseUsdt("40 USDT"), /not a decimal/);
  assert.throws(() => parseUsdt(""), /not a decimal/);
});

test("format round-trips", () => {
  assert.equal(formatUsdt(usdt(40)), "40.00");
  assert.equal(formatUsdt(usdt("4000.5")), "4000.50");
  assert.equal(formatUsdt(usdt(40), 0), "40");
  assert.equal(formatUsdt(usdt("0.000001"), 6), "0.000001");
});

test("tolerance is exact at the usual rates", () => {
  assert.equal(withTolerance(usdt(40), 500), usdt(42));
  assert.equal(withTolerance(usdt(40), 0), usdt(40));
  assert.equal(withTolerance(100n, 1000), 110n);
});

test("tolerance floors rather than rounding up", () => {
  // 7 at 500bps is 7.35 -> 7, so a tolerance never quietly widens itself
  assert.equal(withTolerance(7n, 500), 7n);
  assert.throws(() => withTolerance(100n, -1), /bad bps/);
});

test("line totals are integer only", () => {
  assert.equal(lineTotal(100n, usdt(40)), usdt(4000));
  assert.equal(lineTotal(0n, usdt(40)), 0n);
});
