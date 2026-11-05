#!/usr/bin/env node
/**
 * journal - read and reconcile the Hedera audit journal.
 *
 *   journal replay <topicId>     pull every entry, recompute, report OK or a diff
 *   journal tail <topicId>       print the last entries, newest first
 *   journal create-topic         one-off setup; prints the topic id and submit key
 *
 * Replay needs no credentials. That is the point: an auditor runs this against
 * a public mirror node without asking us for anything.
 */

import { hashscanTopicUrl, readTopic } from "./mirror.ts";
import { decodeMirrorMessage } from "./entry.ts";
import { formatReport, replay } from "./replay.ts";

const USAGE = `usage:
  journal replay <topicId> [--gate <address>] [--rpc <url>] [--chain <id>] [--mirror <url>]
  journal tail <topicId> [--limit <n>]
  journal create-topic
`;

async function keccak(): Promise<(d: `0x${string}`) => `0x${string}`> {
  // viem lives in the web app, not here, so load it only when replaying.
  const { keccak256 } = await import("viem");
  return (d) => keccak256(d);
}

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === "help" || command === "--help") {
    process.stdout.write(USAGE);
    return command ? 0 : 1;
  }

  if (command === "replay") {
    const topicId = rest[0] ?? process.env["HEDERA_TOPIC_ID"];
    if (!topicId) {
      process.stderr.write("no topic id - pass one or set HEDERA_TOPIC_ID\n");
      return 1;
    }

    const gateAddress = (flag(rest, "gate") ?? process.env["GATE_ADDRESS"] ?? "") as
      | `0x${string}`
      | "";
    const rpcUrl =
      flag(rest, "rpc") ?? process.env["EVM_RPC_URL"] ?? "https://rpc.testnet.whitechain.io";

    // With a gate address the replay recomputes each digest from the chain's
    // own logs. Without one it can only check the journal against itself, and
    // every line says so.
    let evmSource;
    if (gateAddress) {
      const { evmSourceFromChain } = await import("./evm.ts");
      const loaded = await evmSourceFromChain({ rpcUrl, gateAddress });
      process.stdout.write(`loaded ${loaded.count} decisions from ${gateAddress}\n\n`);
      evmSource = loaded.source;
    }

    const report = await replay(topicId, {
      keccak256: await keccak(),
      chainId: Number(flag(rest, "chain") ?? process.env["EVM_CHAIN_ID"] ?? 1874),
      gateAddress: (gateAddress || "0x0000000000000000000000000000000000000000") as `0x${string}`,
      ...(flag(rest, "mirror") ? { mirrorUrl: flag(rest, "mirror") as string } : {}),
      ...(evmSource ? { evmSource } : {}),
    });

    process.stdout.write(`${formatReport(report)}\n`);
    process.stdout.write(`\nhashscan  ${hashscanTopicUrl(topicId)}\n`);
    return report.ok ? 0 : 1;
  }

  if (command === "tail") {
    const topicId = rest[0] ?? process.env["HEDERA_TOPIC_ID"];
    if (!topicId) {
      process.stderr.write("no topic id - pass one or set HEDERA_TOPIC_ID\n");
      return 1;
    }
    const limit = Number(flag(rest, "limit") ?? 20);
    const messages = await readTopic(topicId, { order: "desc", limit });

    for (const m of messages.slice(0, limit)) {
      let body: string;
      try {
        body = JSON.stringify(decodeMirrorMessage(m.message));
      } catch {
        body = "<not a zowall entry>";
      }
      process.stdout.write(`#${m.sequence_number}  ${m.consensus_timestamp}  ${body}\n`);
    }
    return 0;
  }

  if (command === "create-topic") {
    const operatorId = process.env["HEDERA_ACCOUNT_ID"];
    const operatorKey = process.env["HEDERA_PRIVATE_KEY"];
    if (!operatorId || !operatorKey) {
      process.stderr.write("set HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY first\n");
      return 1;
    }

    const { createTopic } = await import("./hcs.ts");
    const { topicId, submitKey } = await createTopic({ operatorId, operatorKey });

    process.stdout.write(`topic      ${topicId}\n`);
    process.stdout.write(`submit key ${submitKey}\n`);
    process.stdout.write(`hashscan   ${hashscanTopicUrl(topicId)}\n\n`);
    process.stdout.write("Put the topic id in the README and HEDERA_TOPIC_ID,\n");
    process.stdout.write("and the submit key in HEDERA_SUBMIT_KEY. Never commit it.\n");
    return 0;
  }

  process.stderr.write(`unknown command: ${command}\n${USAGE}`);
  return 1;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
