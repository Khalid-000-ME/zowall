/**
 * The guardians are the part of this package that must hold when the agent is
 * hostile, so these tests are written from the position of a hostile agent: a
 * transaction that pays someone else, one that pays more, one that smuggles in a
 * second recipient, and a middleware that lies about what it is asking to sign.
 *
 * They build real Hedera transactions offline. Nothing here touches a network.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { Client, PrivateKey, Transaction } from "@hashgraph/sdk";

import type { GuardDecision } from "../src/guard.ts";
import {
  GuardianRefused,
  buildAgentSignedTransfer,
  createGuardian,
  guardianQuorum,
  problemsWith,
  summarise,
} from "../src/hedera.ts";
import { payeeAddress } from "../src/quote.ts";
import type { PaymentRequirements } from "../src/types.ts";

const PAYER = "0.0.1001";
const MERCHANT = "0.0.2002";
const ATTACKER = "0.0.6666";
const FACILITATOR = "0.0.9185802";

const agent = PrivateKey.generateECDSA();
const gkeys = [PrivateKey.generateECDSA(), PrivateKey.generateECDSA(), PrivateKey.generateECDSA()];
const client = Client.forTestnet();
// An open client keeps the process alive, and node --test waits for it to exit.
test.after(() => client.close());

const quote = (over: Partial<PaymentRequirements> = {}): PaymentRequirements => ({
  scheme: "exact",
  network: "hedera:testnet",
  amount: "10000",
  asset: "0.0.0",
  payTo: MERCHANT,
  resource: "https://api.example.com/forecast",
  description: "one forecast",
  maxTimeoutSeconds: 60,
  extra: { feePayer: FACILITATOR },
  ...over,
});

const verdict = (allowed: boolean) =>
  ({
    check: async () =>
      ({
        allowed,
        reason: allowed ? "matched" : "refused",
        decision: {
          outcome: allowed ? "PAID" : "REJECTED",
          codes: allowed ? [] : ["NO_PO"],
          violations: [],
          payableAmount: 0n,
          reasonMask: allowed ? 0 : 1,
        },
      }) as unknown as GuardDecision,
  });

const guardians = (allowed: boolean[]) =>
  allowed.map((a, i) => createGuardian({ key: gkeys[i]!, guard: verdict(a), payer: PAYER }));

const honest = () => buildAgentSignedTransfer({ client, requirements: quote(), payer: PAYER, agent });

/* ------------------------------------------------------ reading the bytes -- */

test("a guardian reads what the transaction does, not what it is told", async () => {
  const s = await summarise(await honest());
  assert.equal(s.feePayer, FACILITATOR);
  assert.equal(s.transferOnly, true);
  assert.equal(s.hbar.get(PAYER), -10_000n);
  assert.equal(s.hbar.get(MERCHANT), 10_000n);
});

test("an honest payment has no problems", async () => {
  assert.deepEqual(problemsWith(await summarise(await honest()), quote(), PAYER), []);
});

test("a payment to someone other than the quoted account is refused", async () => {
  const bytes = await buildAgentSignedTransfer({
    client,
    requirements: quote({ payTo: ATTACKER }),
    payer: PAYER,
    agent,
  });
  const p = problemsWith(await summarise(bytes), quote(), PAYER);
  assert.ok(p.some((x) => x.includes(MERCHANT)), p.join("; "));
  assert.ok(p.some((x) => x.includes(ATTACKER)), p.join("; "));
});

test("a payment for more than the quote is refused", async () => {
  const bytes = await buildAgentSignedTransfer({
    client,
    requirements: quote({ amount: "99999" }),
    payer: PAYER,
    agent,
  });
  assert.ok(problemsWith(await summarise(bytes), quote(), PAYER).length > 0);
});

test("a fee payer other than the one the quote names is refused", async () => {
  const bytes = await buildAgentSignedTransfer({
    client,
    requirements: quote({ extra: { feePayer: "0.0.777" } }),
    payer: PAYER,
    agent,
  });
  const p = problemsWith(await summarise(bytes), quote(), PAYER);
  assert.ok(p.some((x) => x.includes("fee payer")), p.join("; "));
});

test("a transaction that is not a plain transfer is refused", async () => {
  const { AccountCreateTransaction, TransactionId, AccountId } = await import("@hashgraph/sdk");
  const other = new AccountCreateTransaction()
    .setKeyWithoutAlias(agent.publicKey)
    .setTransactionId(TransactionId.generate(AccountId.fromString(FACILITATOR)))
    .freezeWith(client);
  const p = problemsWith(await summarise(other.toBytes()), quote(), PAYER);
  assert.ok(p.some((x) => x.includes("not a plain transfer")), p.join("; "));
});

/* ------------------------------------------------------------- guardians -- */

test("a guardian that approves adds its signature", async () => {
  const [g] = guardians([true]);
  const out = await g!.cosign(await honest(), quote());
  assert.ok(out.length > 0);
  // the signed transaction still decodes to the same payment
  assert.equal((await summarise(out)).hbar.get(MERCHANT), 10_000n);
  assert.ok(Transaction.fromBytes(out));
});

test("a guardian refuses when the mandate check refuses", async () => {
  const [g] = guardians([false]);
  await assert.rejects(g!.cosign(await honest(), quote()), GuardianRefused);
});

test("a lying middleware gets nothing signed: the quote says merchant, the bytes pay the attacker", async () => {
  const toAttacker = await buildAgentSignedTransfer({
    client,
    requirements: quote({ payTo: ATTACKER }),
    payer: PAYER,
    agent,
  });
  // Even a guardian whose mandate check would say yes must refuse, because it
  // decodes the transaction and the transaction does not match the quote.
  const [g] = guardians([true]);
  await assert.rejects(g!.cosign(toAttacker, quote()), (e: unknown) => {
    assert.ok(e instanceof GuardianRefused);
    assert.ok(e.problems.some((x) => x.includes(ATTACKER)));
    return true;
  });
});

/* ---------------------------------------------------------------- quorum -- */

test("two of three guardians are enough", async () => {
  const q = await guardianQuorum(await honest(), quote(), guardians([true, true, true]), 2);
  assert.equal(q.signed, 2);
});

test("one refusing guardian is routed around, not fatal", async () => {
  const q = await guardianQuorum(await honest(), quote(), guardians([false, true, true]), 2);
  assert.equal(q.signed, 2);
  assert.equal(q.refusals.length, 1);
});

test("a single approving guardian cannot make a quorum", async () => {
  await assert.rejects(
    guardianQuorum(await honest(), quote(), guardians([true, false, false]), 2),
    /1 of 2 guardians signed/,
  );
});

test("a quorum that cannot be met is refused up front, not after signing", async () => {
  await assert.rejects(guardianQuorum(await honest(), quote(), guardians([true]), 2), GuardianRefused);
});

/* --------------------------------------------------------------- mapping -- */

test("a Hedera account id and its EVM address are the same payee", () => {
  assert.equal(payeeAddress("0.0.11338868"), "0x0000000000000000000000000000000000ad0474");
  assert.equal(payeeAddress("0x1111111111111111111111111111111111111111"), "0x1111111111111111111111111111111111111111");
});
