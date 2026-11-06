/**
 * Everything the app knows about the gate comes from here, read straight off
 * Whitechain. There is no database behind these pages: a purchase order, a
 * decision or a hold is whatever the contract says it is right now, which is
 * the same thing a stranger with an RPC URL would see.
 *
 * Reads are cached for a few seconds because the public RPC is intermittently
 * unavailable and every page would otherwise pay for several round trips.
 */

import {
  createPublicClient,
  decodeFunctionData,
  defineChain,
  http,
  type PublicClient,
} from "viem";
import { codesOf, type Bytes32, type Outcome, type ReasonCode } from "@zowall/gate-core";
import { evmSourceFromChain, type EvmDecision } from "@zowall/journal";
import { GATE_ABI } from "@zowall/sdk";

import { serverEnv } from "@/lib/env";

export const whitechainSepolia = defineChain({
  id: 1874,
  name: "Whitechain Sepolia",
  nativeCurrency: { name: "WhiteBIT Coin", symbol: "WBT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.whitechain.io"] } },
  blockExplorers: {
    default: { name: "Whitechain Explorer", url: "https://explorer.testnet.whitechain.io" },
  },
  testnet: true,
});

const ERC20_BALANCE = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

let client: PublicClient | null = null;

export function publicClient(): PublicClient {
  if (!client) {
    client = createPublicClient({
      chain: whitechainSepolia,
      transport: http(serverEnv().rpcUrl, { retryCount: 6, retryDelay: 1_200, timeout: 30_000 }),
    }) as PublicClient;
  }
  return client;
}

/* ------------------------------------------------------------------ cache -- */

const TTL_MS = 6_000;
const cache = new Map<string, { at: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;

  // Concurrent requests for the same thing share one RPC call.
  const pending = inflight.get(key);
  if (pending) return (await pending) as T;

  const run = load()
    .then((value) => {
      cache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, run);
  return await run;
}

/** Call after the app itself sends a transaction, so the next read is fresh. */
export function invalidateChainCache(): void {
  cache.clear();
}

/* ------------------------------------------------------------------ types -- */

export type POStatus = "Open" | "Closed" | "Cancelled";
const PO_STATUS: Array<POStatus | "None"> = ["None", "Open", "Closed", "Cancelled"];

export type ChainPO = {
  id: bigint;
  vendor: `0x${string}`;
  payee: `0x${string}`;
  specHash: Bytes32;
  qty: bigint;
  unitPrice: bigint;
  priceTolBps: number;
  qtyTolBps: number;
  expiry: bigint;
  received: bigint;
  invoicedQty: bigint;
  invoicedValue: bigint;
  /** reservation still held against this PO, USDT base units */
  encumbered: bigint;
  creatorPersonId: Bytes32;
  receiverPersonId: Bytes32;
  status: POStatus;
};

export type ChainDecision = EvmDecision & {
  codes: ReasonCode[];
  /** block timestamp, unix seconds */
  timestamp: number;
};

export type ChainHold = {
  id: bigint;
  poId: bigint;
  invoiceHash: Bytes32;
  reasonMask: number;
  codes: ReasonCode[];
  createdAt: bigint;
  resolved: boolean;
  resolvedBy: Bytes32;
  payee: `0x${string}`;
  qty: bigint;
  unitPrice: bigint;
};

export type Vault = {
  /** USDT the gate actually holds */
  balance: bigint;
  /** the part of it reserved against open purchase orders */
  encumbered: bigint;
  /** the rest: what a new order, or an override, can draw on */
  free: bigint;
};

/* ------------------------------------------------------------------ reads -- */

function requireGate(): `0x${string}` {
  const gate = serverEnv().gateAddress;
  if (!gate) throw new Error("GATE_ADDRESS is not set");
  return gate;
}

export async function getVault(): Promise<Vault> {
  const env = serverEnv();
  const gate = requireGate();
  if (!env.usdtAddress) throw new Error("USDT_ADDRESS is not set");

  return cached("vault", async () => {
    const pc = publicClient();
    const [balance, encumbered, free] = await Promise.all([
      pc.readContract({
        address: env.usdtAddress!,
        abi: ERC20_BALANCE,
        functionName: "balanceOf",
        args: [gate],
      }),
      pc.readContract({ address: gate, abi: GATE_ABI, functionName: "totalEncumbered" }),
      pc.readContract({ address: gate, abi: GATE_ABI, functionName: "unencumberedBalance" }),
    ]);
    return { balance, encumbered, free };
  });
}

export async function getPO(id: bigint): Promise<ChainPO | null> {
  const gate = requireGate();
  return cached(`po:${id}`, async () => {
    const po = await publicClient().readContract({
      address: gate,
      abi: GATE_ABI,
      functionName: "getPO",
      args: [id],
    });
    const status = PO_STATUS[Number(po.status)] ?? "None";
    if (status === "None") return null;
    return {
      id,
      vendor: po.vendor,
      payee: po.payee,
      specHash: po.specHash,
      qty: po.qty,
      unitPrice: po.unitPrice,
      priceTolBps: po.priceTolBps,
      qtyTolBps: po.qtyTolBps,
      expiry: po.expiry,
      received: po.received,
      invoicedQty: po.invoicedQty,
      invoicedValue: po.invoicedValue,
      encumbered: po.encumbered,
      creatorPersonId: po.creatorPersonId,
      receiverPersonId: po.receiverPersonId,
      status,
    };
  });
}

export async function getPOs(): Promise<ChainPO[]> {
  const gate = requireGate();
  const next = await cached("nextPoId", () =>
    publicClient().readContract({ address: gate, abi: GATE_ABI, functionName: "nextPoId" }),
  );

  const ids: bigint[] = [];
  for (let i = 1n; i < next; i++) ids.push(i);

  const all = await Promise.all(ids.map((id) => getPO(id)));
  return all.filter((p): p is ChainPO => p !== null).sort((a, b) => Number(b.id - a.id));
}

const blockTimes = new Map<bigint, number>();

async function timestampOf(block: bigint): Promise<number> {
  const known = blockTimes.get(block);
  if (known !== undefined) return known;
  const b = await publicClient().getBlock({ blockNumber: block });
  const ts = Number(b.timestamp);
  blockTimes.set(block, ts);
  return ts;
}

/** Every decision the gate has ever made, oldest first, decoded from its logs. */
export async function getDecisions(): Promise<ChainDecision[]> {
  const env = serverEnv();
  const gate = requireGate();

  return cached("decisions", async () => {
    const { decisions } = await evmSourceFromChain({
      rpcUrl: env.rpcUrl,
      gateAddress: gate,
      ...(env.gateDeployBlock !== null ? { fromBlock: env.gateDeployBlock } : {}),
    });

    return Promise.all(
      decisions.map(async (d) => ({
        ...d,
        codes: codesOf(d.reasonMask),
        timestamp: await timestampOf(BigInt(d.blockNumber)),
      })),
    );
  });
}

export async function getHold(id: bigint): Promise<ChainHold | null> {
  const gate = requireGate();
  return cached(`hold:${id}`, async () => {
    const h = await publicClient().readContract({
      address: gate,
      abi: GATE_ABI,
      functionName: "getHold",
      args: [id],
    });
    if (h.createdAt === 0n) return null;
    return {
      id,
      poId: h.poId,
      invoiceHash: h.invoiceHash,
      reasonMask: h.reasonMask,
      codes: codesOf(h.reasonMask),
      createdAt: h.createdAt,
      resolved: h.resolved,
      resolvedBy: h.resolvedBy,
      payee: h.payee,
      qty: h.qty,
      unitPrice: h.unitPrice,
    };
  });
}

/** Holds still waiting for a different human, newest first. */
export async function getOpenHolds(): Promise<ChainHold[]> {
  const decisions = await getDecisions();
  const ids = [
    ...new Set(
      decisions
        .filter((d) => d.outcome === "HELD" && d.holdId && d.holdId > 0n)
        .map((d) => d.holdId as bigint),
    ),
  ];
  const holds = await Promise.all(ids.map((id) => getHold(id)));
  return holds
    .filter((h): h is ChainHold => h !== null && !h.resolved)
    .sort((a, b) => Number(b.id - a.id));
}

export type SubmittedInvoice = {
  payee: `0x${string}`;
  qty: bigint;
  unitPrice: bigint;
  vendor: `0x${string}`;
};

/**
 * What the invoice itself said, recovered from the transaction that submitted
 * it. The Decision event records the numbers the gate judged, but not who the
 * invoice asked to pay, and a payee mismatch can only be shown if that is known.
 */
export async function invoiceFromTx(txHash: string): Promise<SubmittedInvoice | null> {
  try {
    const tx = await cached(`tx:${txHash}`, () =>
      publicClient().getTransaction({ hash: txHash as `0x${string}` }),
    );
    const decoded = decodeFunctionData({ abi: GATE_ABI, data: tx.input });
    if (decoded.functionName !== "submitInvoice") return null;
    const inv = decoded.args[0];
    return { payee: inv.payee, qty: inv.qty, unitPrice: inv.unitPrice, vendor: inv.vendor };
  } catch {
    return null;
  }
}

export const OUTCOME_LABEL: Record<Outcome, string> = {
  PAID: "paid",
  HELD: "held",
  REJECTED: "refused",
};
