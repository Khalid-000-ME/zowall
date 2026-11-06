/**
 * One-off: create a guardian-protected payer account on Hedera testnet and
 * prove, against the live network, that it cannot be spent without the
 * guardians.
 *
 *   set -a; source .env.local; set +a
 *   node packages/x402/scripts/guardian-setup.ts
 *
 * It prints the ids and keys to put in .env.local. The keys are secrets and are
 * never committed; the account ids are public.
 */

import { appendFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  AccountCreateTransaction,
  AccountId,
  Client,
  Hbar,
  HbarUnit,
  PrivateKey,
  Transaction,
  TransactionId,
  TransferTransaction,
} from "@hashgraph/sdk";

import { createGuardedAccount, guardedKey } from "../src/hedera.ts";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function parseKey(value: string): PrivateKey {
  const raw = value.trim().replace(/^0x/, "");
  return /^30[23]/.test(raw) ? PrivateKey.fromStringDer(raw) : PrivateKey.fromStringECDSA(raw);
}

const operatorId = env("HEDERA_ACCOUNT_ID");
const operatorKey = parseKey(env("HEDERA_PRIVATE_KEY"));
const client = Client.forTestnet().setOperator(operatorId, operatorKey);

const hashscan = (tx: string) => `https://hashscan.io/testnet/transaction/${encodeURIComponent(tx)}`;

try {
  const agent = PrivateKey.generateECDSA();
  const guardians = [PrivateKey.generateECDSA(), PrivateKey.generateECDSA(), PrivateKey.generateECDSA()];

  console.log("creating the merchant (the account the agent will pay)...");
  const merchantKey = PrivateKey.generateECDSA();
  const merchantTx = await new AccountCreateTransaction()
    .setKeyWithoutAlias(merchantKey.publicKey)
    .setInitialBalance(new Hbar(1))
    .setAccountMemo("zowall demo merchant")
    .execute(client);
  const merchant = (await merchantTx.getReceipt(client)).accountId!.toString();

  console.log("creating the guarded payer: agent AND 2-of-3 guardians...");
  const payer = await createGuardedAccount({
    client,
    agent,
    guardians,
    guardianThreshold: 2,
    initialHbar: 8,
    memo: "zowall guarded payer",
  });

  console.log(`\nmerchant  ${merchant}`);
  console.log(`payer     ${payer}   https://hashscan.io/testnet/account/${payer}`);

  /** A transfer of 1,000 tinybars payer -> merchant, with the operator as fee payer. */
  const transfer = () =>
    new TransferTransaction()
      .setTransactionId(TransactionId.generate(AccountId.fromString(operatorId)))
      .addHbarTransfer(payer, Hbar.from(-1000, HbarUnit.Tinybar))
      .addHbarTransfer(merchant, Hbar.from(1000, HbarUnit.Tinybar))
      .freezeWith(client);

  console.log("\n1. the agent alone, with the fee payer's signature");
  try {
    const t = transfer();
    await t.sign(agent);
    const res = await (await t.signWithOperator(client)).execute(client);
    await res.getReceipt(client);
    console.log("   UNEXPECTED: the payment went through");
    process.exitCode = 1;
  } catch (err) {
    console.log(`   refused by the network: ${(err as { status?: { toString(): string } }).status ?? err}`);
  }

  console.log("\n2. one guardian and the agent");
  try {
    const t = transfer();
    await t.sign(agent);
    await t.sign(guardians[0]!);
    const res = await (await t.signWithOperator(client)).execute(client);
    await res.getReceipt(client);
    console.log("   UNEXPECTED: the payment went through");
    process.exitCode = 1;
  } catch (err) {
    console.log(`   refused by the network: ${(err as { status?: { toString(): string } }).status ?? err}`);
  }

  console.log("\n3. guardians alone, no agent");
  try {
    const t = transfer();
    await t.sign(guardians[0]!);
    await t.sign(guardians[1]!);
    const res = await (await t.signWithOperator(client)).execute(client);
    await res.getReceipt(client);
    console.log("   UNEXPECTED: the payment went through");
    process.exitCode = 1;
  } catch (err) {
    console.log(`   refused by the network: ${(err as { status?: { toString(): string } }).status ?? err}`);
  }

  console.log("\n4. the agent and two of three guardians");
  const t = transfer();
  await t.sign(agent);
  await t.sign(guardians[0]!);
  await t.sign(guardians[2]!);
  const res = await (await t.signWithOperator(client)).execute(client);
  const receipt = await res.getReceipt(client);
  const id = res.transactionId.toString();
  console.log(`   ${receipt.status}  ${id}`);
  console.log(`   ${hashscan(id)}`);

  // Show the structure the network is enforcing, as the mirror node reports it.
  const key = await guardedKey(agent, guardians, 2);
  console.log(`\nkey structure: threshold ${(key as { threshold?: number }).threshold ?? 2} of 2 [agent, 2-of-3 guardians]`);

  // The keys are secrets, so they go straight into the gitignored env file and
  // are never printed. Only the public account ids are shown.
  const envFile = resolve(process.cwd(), ".env.local");
  appendFileSync(
    envFile,
    [
      "",
      "# x402 guardian-protected payer (created by packages/x402/scripts/guardian-setup.ts)",
      `X402_PAYER_ACCOUNT=${payer}`,
      `X402_PAY_TO=${merchant}`,
      `X402_AGENT_KEY=${agent.toStringRaw()}`,
      `X402_GUARDIAN_KEYS=${guardians.map((g) => g.toStringRaw()).join(",")}`,
      "X402_GUARDIAN_THRESHOLD=2",
      "",
    ].join("\n"),
  );
  console.log(`\nwrote the keys to ${envFile}`);
  void Transaction;
} finally {
  client.close();
}
