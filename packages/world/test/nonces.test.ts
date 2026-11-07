import { test } from "node:test";
import assert from "node:assert/strict";

import { createNonceStore } from "../src/nonces.ts";

test("an issued nonce is accepted once and never again", () => {
  const s = createNonceStore();
  s.issue("0xabc");
  assert.equal(s.consume("0xabc"), true);
  assert.equal(s.consume("0xabc"), false);
});

test("a nonce the server never issued is refused", () => {
  assert.equal(createNonceStore().consume("0xnever"), false);
});

test("an expired nonce is refused", () => {
  let t = 1_000;
  const s = createNonceStore({ ttlMs: 500, now: () => t });
  s.issue("0xabc");
  t += 501;
  assert.equal(s.consume("0xabc"), false);
});

test("the store is bounded, so a flood of nonces cannot grow it forever", () => {
  const s = createNonceStore({ max: 3 });
  for (let i = 0; i < 10; i++) s.issue(`0x${i}`);
  assert.ok(s.size() <= 3);
  assert.equal(s.consume("0x0"), false, "the oldest were evicted");
  assert.equal(s.consume("0x9"), true);
});
