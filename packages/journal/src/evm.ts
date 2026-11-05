/**
 * An EvmSource built from the chain's own logs.
 *
 * Every field the digest covers comes out of the `Decision` event's preimage,
 * so this needs no database, no indexer and no cooperation from the operator -
 * which is the only way "replay it yourself" is a real offer.
 */

import { createPublicClient, decodeAbiParameters, http, parseEventLogs } from "viem";
import type { Bytes32, Outcome } from "@zowall/gate-core";

import type { EvmDecision, EvmSource } from "./replay.ts";

const DECISION_EVENT = {
  type: "event",
  name: "Decision",
  inputs: [
    { name: "poId", type: "uint256", indexed: true },
    { name: "invoiceHash", type: "bytes32", indexed: false },
    { name: "outcome", type: "uint8", indexed: false },
    { name: "reasonMask", type: "uint32", indexed: false },
    { name: "paid", type: "uint256", indexed: false },
    { name: "holdId", type: "uint256", indexed: false },
    { name: "journalDigest", type: "bytes32", indexed: false },
    { name: "preimage", type: "bytes", indexed: false },
  ],
} as const;

const PREIMAGE_LAYOUT = [
  { type: "uint256" }, // chainId
  { type: "address" }, // gate
  { type: "uint256" }, // poId
  { type: "bytes32" }, // invoiceHash
  { type: "uint8" }, // outcome
  { type: "uint32" }, // reasonMask
  { type: "uint128" }, // invQty
  { type: "uint128" }, // recvQty
  { type: "uint128" }, // invUnitPrice
  { type: "uint128" }, // poUnitPrice
  { type: "bytes32" }, // creatorPersonId
  { type: "bytes32" }, // receiverPersonId
  { type: "bytes32" }, // approverPersonId
  { type: "uint256" }, // nonce
] as const;

const OUTCOMES: readonly Outcome[] = ["PAID", "HELD", "REJECTED"];

export type EvmSourceOptions = {
  rpcUrl: string;
  gateAddress: `0x${string}`;
  /** explicit start block; otherwise the last `lookback` blocks are scanned */
  fromBlock?: bigint;
  /** how many blocks back to search when fromBlock is not given */
  lookback?: bigint;
};

/**
 * The public RPC rejects any eth_getLogs span over 10,000 blocks
 * ("query exceeds max block range 10000"), so the scan is chunked. Slightly
 * under the limit, because the cap is inclusive and off-by-one here costs a
 * confusing error rather than a missing log.
 */
const MAX_SPAN = 9_000n;

/**
 * Loads every decision the gate has ever emitted, keyed by invoice hash.
 *
 * Loaded once up front rather than per lookup: a replay checks every entry on
 * the topic, and one RPC round trip per entry is both slow and exactly the
 * kind of thing that falls over on venue wifi.
 */
export async function evmSourceFromChain(
  options: EvmSourceOptions,
): Promise<{ source: EvmSource; count: number; decisions: EvmDecision[] }> {
  const client = createPublicClient({
    transport: http(options.rpcUrl, { retryCount: 5, retryDelay: 1_200, timeout: 30_000 }),
  });

  const latest = await client.getBlockNumber();
  const lookback = options.lookback ?? 50_000n;
  const start =
    options.fromBlock ?? (latest > lookback ? latest - lookback : 0n);

  const logs = [];
  for (let from = start; from <= latest; from += MAX_SPAN + 1n) {
    const to = from + MAX_SPAN > latest ? latest : from + MAX_SPAN;
    logs.push(
      ...(await client.getLogs({
        address: options.gateAddress,
        event: DECISION_EVENT,
        fromBlock: from,
        toBlock: to,
      })),
    );
  }

  const parsed = parseEventLogs({ abi: [DECISION_EVENT], eventName: "Decision", logs });
  // Keyed by transaction: one invoice can be decided twice (PAID, then
  // DUPLICATE_INVOICE over identical bytes), and keying by invoice hash
  // silently drops the first of them.
  const byTx = new Map<string, EvmDecision>();

  for (const log of parsed) {
    const a = log.args;
    const [
      ,
      ,
      poId,
      invoiceHash,
      outcome,
      reasonMask,
      invQty,
      recvQty,
      invUnitPrice,
      poUnitPrice,
      creatorPersonId,
      receiverPersonId,
      approverPersonId,
      nonce,
    ] = decodeAbiParameters(PREIMAGE_LAYOUT, a.preimage);

    byTx.set(log.transactionHash.toLowerCase(), {
      poId: poId as bigint,
      invoiceHash: invoiceHash as Bytes32,
      outcome: OUTCOMES[Number(outcome)] ?? "REJECTED",
      reasonMask: Number(reasonMask),
      invQty: invQty as bigint,
      recvQty: recvQty as bigint,
      invUnitPrice: invUnitPrice as bigint,
      poUnitPrice: poUnitPrice as bigint,
      creatorPersonId: creatorPersonId as Bytes32,
      receiverPersonId: receiverPersonId as Bytes32,
      approverPersonId: approverPersonId as Bytes32,
      nonce: nonce as bigint,
      journalDigest: a.journalDigest as Bytes32,
      txHash: log.transactionHash,
      blockNumber: Number(log.blockNumber),
    });
  }

  return {
    count: byTx.size,
    decisions: [...byTx.values()].sort((a, b) => a.blockNumber - b.blockNumber),
    source: (ref) => byTx.get(ref.txHash.toLowerCase()) ?? null,
  };
}
