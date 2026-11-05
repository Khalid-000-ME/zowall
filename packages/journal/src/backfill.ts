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

process.stdout.write(`${decisions.length} decisions on ${gateAddress}\n\n`);

for (const d of decisions) {
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
