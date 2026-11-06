/**
 * Write every decision the gate has emitted to the journal.
 *
 * Normally the app writes an entry as each decision happens. This catches the
 * journal up to a chain that already has history - after a redeploy, or when
 * Hedera was unreachable and QueueingWriter had to hold entries back.
 *
 *   node packages/journal/src/backfill.ts
 */

import { codesOf } from "@zowall/gate-core";

import { evmSourceFromChain } from "./evm.ts";
import { decodeTopic, readTopic } from "./mirror.ts";
import { JournalWriter } from "./hcs.ts";
import type { DecisionEntry } from "./entry.ts";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

const gateAddress = env("GATE_ADDRESS") as `0x${string}`;
const rpcUrl = process.env["EVM_RPC_URL"] ?? "https://rpc.testnet.whitechain.io";
const chainId = Number(process.env["EVM_CHAIN_ID"] ?? 1874);

const { source, decisions } = await evmSourceFromChain({ rpcUrl, gateAddress });

const writer = new JournalWriter({
  operatorId: env("HEDERA_ACCOUNT_ID"),
  operatorKey: env("HEDERA_PRIVATE_KEY"),
  submitKey: env("HEDERA_SUBMIT_KEY"),
  topicId: env("HEDERA_TOPIC_ID"),
  network: "testnet",
});

// Idempotent: a decision already on the topic is not written again. The topic is
// permanent, so a duplicate entry could never be taken back.
const journaled = new Set(
  decodeTopic(await readTopic(env("HEDERA_TOPIC_ID"), { order: "asc" })).records
    .map((r) => r.entry.evm?.tx?.toLowerCase())
    .filter((t): t is string => typeof t === "string"),
);

process.stdout.write(`${decisions.length} decisions on ${gateAddress}, ${journaled.size} already journaled\n\n`);

for (const d of decisions) {
  if (journaled.has(d.txHash.toLowerCase())) continue;
  const entry: DecisionEntry = {
    v: 1,
    kind: "decision",
    po: Number(d.poId),
    inv: d.invoiceHash,
    outcome: d.outcome,
    codes: codesOf(d.reasonMask),
    qty: { inv: d.invQty.toString(), recv: d.recvQty.toString() },
    unit: { inv: d.invUnitPrice.toString(), po: d.poUnitPrice.toString() },
    evm: { chain: chainId, tx: d.txHash, block: d.blockNumber },
    dig: d.journalDigest,
    at: Date.now(),
  };

  const result = await writer.write(entry);
  process.stdout.write(
    `  #${result.sequenceNumber}  ${d.outcome.padEnd(8)} po#${d.poId}  ` +
      `${codesOf(d.reasonMask).join(",") || "clean"}  (${result.bytes} bytes)\n`,
  );
}

process.stdout.write(`\ntopic https://hashscan.io/testnet/topic/${env("HEDERA_TOPIC_ID")}\n`);
