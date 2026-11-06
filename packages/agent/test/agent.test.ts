import { test } from "node:test";
import assert from "node:assert/strict";

import { usdt, type Address } from "@zowall/gate-core";
import { SAMPLE_ATTACKS, parseIntent, run } from "../src/index.ts";

const ATTACKER = "0xbA3012c79C1F2aC25e4Bb2106aF140aE6A4C7269" as Address;
const VENDOR = "0x1111111111111111111111111111111111111111" as Address;

test("the agent falls for the changed-bank-details email, as designed", () => {
  const intent = parseIntent(SAMPLE_ATTACKS[0]!.text);
  assert.equal(intent.kind, "pay_adhoc");
  if (intent.kind !== "pay_adhoc") return;
  assert.equal(intent.payee.toLowerCase(), ATTACKER.toLowerCase());
  assert.equal(intent.amount, usdt(4000));
});

test("it parses a comma-formatted amount, because real emails have them", () => {
  const intent = parseIntent(SAMPLE_ATTACKS[2]!.text);
  assert.equal(intent.kind, "pay_adhoc");
  if (intent.kind !== "pay_adhoc") return;
  assert.equal(intent.amount, usdt("1250.50"));
});

test("text with no payment instruction does nothing", () => {
  assert.equal(parseIntent("Thanks, the monitors arrived fine.").kind, "nothing");
});

test("every ad-hoc payment reaches the gate and is refused there", async () => {
  const seen: Array<{ poId: bigint; payee: string }> = [];

  const gate = {
    async pay(invoice: { poId: bigint; payee: string }) {
      seen.push({ poId: invoice.poId, payee: invoice.payee });
      return {
        outcome: "REJECTED",
        codes: ["NO_PO"],
        explain: () => "There is no open purchase order for this invoice.",
      };
    },
  };

  for (const attack of SAMPLE_ATTACKS) {
    const result = await run(attack.text, gate, { vendor: VENDOR });
    assert.equal(result.outcome, "REJECTED", attack.label);
    assert.deepEqual(result.codes, ["NO_PO"], attack.label);
  }

  // The agent never invents a purchase order, because it has none to invent.
  assert.ok(seen.every((s) => s.poId === 0n));
  assert.equal(seen.length, SAMPLE_ATTACKS.length);
});

test("the agent reports what it tried, so the console can show it", async () => {
  const gate = {
    async pay() {
      return { outcome: "REJECTED", codes: ["NO_PO"], explain: () => "no PO" };
    },
  };
  const result = await run(SAMPLE_ATTACKS[0]!.text, gate, { vendor: VENDOR });
  assert.match(result.narration, /I will send/);
  assert.match(result.narration, /bA3012c7/i);
});
