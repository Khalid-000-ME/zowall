import { test } from "node:test";
import assert from "node:assert/strict";

import { usdt, type Address, type Bytes32, type Invoice } from "@zowall/gate-core";
import { createGate } from "../src/index.ts";

const GATE = "0x00000000000000000000000000000000000000Ba5e" as Address;
const VENDOR = "0x1111111111111111111111111111111111111111" as Address;

const invoice: Invoice = {
  poId: 17n,
  vendor: VENDOR,
  payee: VENDOR,
  qty: 100n,
  unitPrice: usdt(40),
  invoiceHash: `0x${"1a".repeat(32)}` as Bytes32,
  nonce: 1n,
  deadline: 0n,
};

function clients(mask: number, outcome: number) {
  return {
    publicClient: {
      readContract: async () => [mask, outcome],
      waitForTransactionReceipt: async () => ({}),
    },
    walletClient: {
      writeContract: async () => `0x${"ab".repeat(32)}` as `0x${string}`,
    },
  };
}

test("a clean invoice previews as PAID with no codes", async () => {
  const gate = createGate({ gateAddress: GATE, ...clients(0, 0) });
  const result = await gate.preview(invoice, "0xsig");

  assert.equal(result.outcome, "PAID");
  assert.deepEqual(result.codes, []);
  assert.match(result.explain(), /Matched the purchase order/);
});

test("a refusal comes back as a result, with words, not as a throw", async () => {
  // QTY_OVER_RECEIVED | PRICE_OVER_TOLERANCE
  const gate = createGate({ gateAddress: GATE, ...clients((1 << 9) | (1 << 10), 1) });
  const result = await gate.pay(invoice, "0xsig");

  assert.equal(result.outcome, "HELD");
  assert.deepEqual(result.codes, ["QTY_OVER_RECEIVED", "PRICE_OVER_TOLERANCE"]);
  assert.match(result.explain(), /more than was received/);
  assert.match(result.explain(), /above the agreed price/);
  assert.ok(result.txHash?.startsWith("0x"));
});

test("a read-only gate can preview but refuses to pay", async () => {
  const { publicClient } = clients(0, 0);
  const gate = createGate({ gateAddress: GATE, publicClient });

  assert.equal((await gate.preview(invoice, "0xsig")).outcome, "PAID");
  await assert.rejects(() => gate.pay(invoice, "0xsig"), /read-only/);
});

test("an unknown outcome code is treated as a refusal, never as a payment", async () => {
  const gate = createGate({ gateAddress: GATE, ...clients(0, 99) });
  assert.equal((await gate.preview(invoice, "0xsig")).outcome, "REJECTED");
});
