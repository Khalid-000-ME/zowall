/**
 * The hosted checkout.
 *
 * A merchant (the vendor) creates a session from an invoice it has signed. The
 * buyer opens the session's page, sees what is being paid and which checks the
 * gate has already run, and pays. Paying submits the vendor-signed invoice to the
 * gate, which decides: PAID moves USDT in that transaction, HELD parks it for a
 * person, REJECTED moves nothing.
 *
 * The server relays the transaction and is trusted with nothing. `submitInvoice`
 * is permissionless and the vendor's signature, which covers every field, is the
 * authority, so a relayer cannot alter an invoice and cannot make a refused one
 * pay. It can only decline to send it.
 *
 * Nothing in here is a test path. There is no scenario selector, no stand-in
 * identity and no way to skip a check: the page shows what the gate says, and the
 * gate's answer is the only answer.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { timingSafeEqual } from "node:crypto";

import { createWalletClient, http, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { codesOf, formatUsdt, type ReasonCode } from "@zowall/gate-core";
import { decodePreimage, type JournalEntry } from "@zowall/journal";
import { GATE_ABI } from "@zowall/sdk";

import {
  getHold,
  getPO,
  getResolutions,
  invalidateChainCache,
  publicClient,
  whitechainSepolia,
} from "@/lib/chain";
import { txUrl } from "@/lib/chains";
import { serial } from "@/lib/demo";
import { serverEnv } from "@/lib/env";
import { describe as describeOrder } from "@/lib/store";

/* ------------------------------------------------------------------- types -- */

/** The invoice as the vendor signed it. Amounts are strings because JSON has no bigint. */
export type SessionInvoice = {
  poId: string;
  vendor: `0x${string}`;
  payee: `0x${string}`;
  qty: string;
  unitPrice: string;
  invoiceHash: `0x${string}`;
  nonce: string;
  deadline: string;
};

export type SessionStatus = "open" | "processing" | "paid" | "held" | "refused";

export type Session = {
  id: string;
  invoice: SessionInvoice;
  signature: `0x${string}`;
  /** what is being bought, in the merchant's words */
  description: string;
  /** the merchant's own reference, echoed back */
  reference?: string;
  successUrl?: string;
  cancelUrl?: string;
  createdAt: number;
  status: SessionStatus;
  result?: {
    outcome: "PAID" | "HELD" | "REJECTED";
    codes: ReasonCode[];
    txHash: string;
    holdId?: string;
    paid?: string;
  };
};

export type CheckState = "pass" | "hold" | "fail";

export type Check = { label: string; state: CheckState; detail: string };

export type CheckoutView = {
  id: string;
  status: SessionStatus;
  description: string;
  reference: string | null;
  orderId: string;
  payee: string;
  qty: string;
  /** USDT, formatted */
  unitPrice: string;
  total: string;
  invoiceRef: string;
  gate: string | null;
  chainId: number;
  explorer: { gate: string | null };
  successUrl: string | null;
  cancelUrl: string | null;
  /** live checks against the chain, or the recorded ones once decided */
  checks: Check[];
  /** the outcome the gate would give right now, before anything is sent */
  preview: "PAID" | "HELD" | "REJECTED" | null;
  result: {
    outcome: "PAID" | "HELD" | "REJECTED";
    reasons: string[];
    txUrl: string | null;
    txHash: string;
    holdId: string | null;
    /** for a held invoice: whether a person has since decided it */
    resolution: { approved: boolean; txUrl: string | null } | null;
  } | null;
  /** the invoice's deadline has passed: the signature is no longer usable */
  expired: boolean;
};

/* ------------------------------------------------------------------- store -- */

const FILE = resolve(process.cwd(), ".data/checkout.json");

function load(): Record<string, Session> {
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as Record<string, Session>;
  } catch {
    return {};
  }
}

function save(all: Record<string, Session>): void {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(all, null, 2));
}

export function getSession(id: string): Session | null {
  return load()[id] ?? null;
}

function put(session: Session): void {
  const all = load();
  all[session.id] = session;
  save(all);
}

/* --------------------------------------------------------------------- auth -- */

/**
 * Creating a session is a merchant action, so it needs the merchant's secret.
 * With no secret configured it is refused outright rather than left open.
 */
export function authorised(request: Request): "ok" | "unconfigured" | "denied" {
  const secret = process.env.CHECKOUT_API_KEY;
  if (!secret) return "unconfigured";
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b) ? "ok" : "denied";
}

/* ---------------------------------------------------------------- creation -- */

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const UINT = /^\d{1,40}$/;

export type NewSession = {
  invoice: SessionInvoice;
  signature: string;
  description?: string;
  reference?: string;
  successUrl?: string;
  cancelUrl?: string;
};

function safeUrl(u: unknown): string | undefined {
  if (typeof u !== "string" || u === "") return undefined;
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** Reject anything that is not a well-formed signed invoice before it is stored. */
export function validate(body: Partial<NewSession> | null): { ok: true; value: NewSession } | { ok: false; error: string } {
  const inv = body?.invoice;
  if (!inv) return { ok: false, error: "invoice is required" };
  if (!UINT.test(String(inv.poId))) return { ok: false, error: "invoice.poId must be a whole number" };
  if (!ADDR.test(String(inv.vendor))) return { ok: false, error: "invoice.vendor must be an address" };
  if (!ADDR.test(String(inv.payee))) return { ok: false, error: "invoice.payee must be an address" };
  for (const k of ["qty", "unitPrice", "nonce", "deadline"] as const) {
    if (!UINT.test(String(inv[k]))) return { ok: false, error: `invoice.${k} must be a whole number` };
  }
  if (!HEX32.test(String(inv.invoiceHash))) return { ok: false, error: "invoice.invoiceHash must be 32 bytes" };
  if (!/^0x[0-9a-fA-F]{130}$/.test(String(body?.signature))) {
    return { ok: false, error: "signature must be a 65-byte hex string" };
  }
  return { ok: true, value: body as NewSession };
}

export function createSession(input: NewSession): Session {
  const session: Session = {
    id: `cs_${crypto.randomUUID().replaceAll("-", "").slice(0, 24)}`,
    invoice: {
      poId: String(input.invoice.poId),
      vendor: input.invoice.vendor,
      payee: input.invoice.payee,
      qty: String(input.invoice.qty),
      unitPrice: String(input.invoice.unitPrice),
      invoiceHash: input.invoice.invoiceHash,
      nonce: String(input.invoice.nonce),
      deadline: String(input.invoice.deadline),
    },
    signature: input.signature as `0x${string}`,
    description: (input.description ?? "").slice(0, 120),
    ...(input.reference ? { reference: input.reference.slice(0, 120) } : {}),
    ...(safeUrl(input.successUrl) ? { successUrl: safeUrl(input.successUrl)! } : {}),
    ...(safeUrl(input.cancelUrl) ? { cancelUrl: safeUrl(input.cancelUrl)! } : {}),
    createdAt: Date.now(),
    status: "open",
  };
  put(session);
  return session;
}

/* ----------------------------------------------------------------- the view -- */

const tuple = (i: SessionInvoice) => ({
  poId: BigInt(i.poId),
  vendor: i.vendor,
  payee: i.payee,
  qty: BigInt(i.qty),
  unitPrice: BigInt(i.unitPrice),
  invoiceHash: i.invoiceHash,
  nonce: BigInt(i.nonce),
  deadline: BigInt(i.deadline),
});

/**
 * Which checks a set of reason codes touches, in words a buyer reads. A check
 * with a hard code fails, one with only a soft code is waiting on a person, and
 * the rest pass.
 */
const CHECKS: ReadonlyArray<{ label: string; hard: ReasonCode[]; soft: ReasonCode[] }> = [
  { label: "Matches an open purchase order", hard: ["NO_PO", "PO_CLOSED", "PO_EXPIRED"], soft: [] },
  { label: "Signed by the vendor, payable to the order's payee", hard: ["BAD_SIGNATURE", "PAYEE_MISMATCH"], soft: [] },
  { label: "Goods received and signed for by someone else", hard: [], soft: ["NO_RECEIPT", "QTY_OVER_RECEIVED"] },
  { label: "Price within the agreed tolerance", hard: [], soft: ["PRICE_OVER_TOLERANCE"] },
  { label: "Within the reserved funds, and not paid before", hard: ["BUDGET_EXCEEDED", "DUPLICATE_INVOICE"], soft: [] },
];

export function checksFor(codes: readonly ReasonCode[]): Check[] {
  const has = (c: ReasonCode) => codes.includes(c);
  return CHECKS.map((c) => {
    const hard = c.hard.find(has);
    const soft = c.soft.find(has);
    const state: CheckState = hard ? "fail" : soft ? "hold" : "pass";
    return { label: c.label, state, detail: hard ?? soft ?? "" };
  });
}

const OUTCOME = ["PAID", "HELD", "REJECTED"] as const;

export async function buildView(session: Session): Promise<CheckoutView> {
  const env = serverEnv();
  const i = session.invoice;
  const total = BigInt(i.qty) * BigInt(i.unitPrice);
  const order = describeOrder(BigInt(i.poId));

  // Before payment, ask the gate what would happen. After it, show what did.
  let codes: ReasonCode[] = session.result?.codes ?? [];
  let preview: CheckoutView["preview"] = null;

  if (session.status === "open" && env.gateAddress) {
    try {
      const [mask, outcome] = (await publicClient().readContract({
        address: env.gateAddress,
        abi: GATE_ABI,
        functionName: "previewInvoice",
        args: [tuple(i), session.signature],
      })) as [number, number];
      codes = codesOf(Number(mask));
      preview = OUTCOME[outcome] ?? "REJECTED";
    } catch {
      // A node that does not answer is not a verdict. The checks show as pending
      // rather than as a pass, and payment is still decided by the gate itself.
    }
  }

  let resolution: NonNullable<CheckoutView["result"]>["resolution"] = null;
  if (session.status === "held" && session.result?.holdId) {
    try {
      const hold = await getHold(BigInt(session.result.holdId));
      if (hold?.resolved) {
        const r = (await getResolutions()).find((x) => x.holdId === BigInt(session.result!.holdId!));
        if (r) resolution = { approved: r.approved, txUrl: txUrl(env.chainId, r.txHash) };
      }
    } catch {
      // The hold is still held as far as this page can tell.
    }
  }

  const result = session.result
    ? {
        outcome: session.result.outcome,
        reasons: session.result.codes,
        txUrl: txUrl(env.chainId, session.result.txHash),
        txHash: session.result.txHash,
        holdId: session.result.holdId ?? null,
        resolution,
      }
    : null;

  return {
    id: session.id,
    status: session.status,
    description: session.description || order || `Order #${i.poId}`,
    reference: session.reference ?? null,
    orderId: i.poId,
    payee: i.payee,
    qty: i.qty,
    unitPrice: formatUsdt(BigInt(i.unitPrice)),
    total: formatUsdt(total),
    invoiceRef: i.invoiceHash,
    gate: env.gateAddress,
    chainId: env.chainId,
    explorer: { gate: env.gateAddress ? (txUrl(env.chainId, "")?.replace("/tx/", `/address/${env.gateAddress}`) ?? null) : null },
    successUrl: session.successUrl ?? null,
    cancelUrl: session.cancelUrl ?? null,
    checks: checksFor(codes),
    preview,
    result,
    expired: BigInt(i.deadline) <= BigInt(Math.floor(Date.now() / 1000)),
  };
}

/* ------------------------------------------------------------------ paying -- */

export class CheckoutError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Submit the session's invoice to the gate and record what it decided.
 *
 * Idempotent by status: a session is decided once. A second press while the
 * first is in flight, or after it finished, never sends a second transaction.
 */
export async function pay(id: string): Promise<{ session: Session; journal: JournalEntry[] }> {
  const env = serverEnv();
  const session = getSession(id);
  if (!session) throw new CheckoutError("No such checkout.", 404);
  if (session.status !== "open") return { session, journal: [] };
  if (!env.gateAddress || !env.deployerKey) {
    throw new CheckoutError("This gateway is not configured to relay payments.", 503);
  }
  if (BigInt(session.invoice.deadline) <= BigInt(Math.floor(Date.now() / 1000))) {
    throw new CheckoutError("This invoice has expired. Ask the merchant for a new one.", 410);
  }

  put({ ...session, status: "processing" });

  try {
    const account = privateKeyToAccount(env.deployerKey);
    const wallet = createWalletClient({
      account,
      chain: whitechainSepolia,
      transport: http(env.rpcUrl, { retryCount: 6, retryDelay: 500, timeout: 20_000 }),
    });

    const hash = await serial(() =>
      wallet.writeContract({
        address: env.gateAddress!,
        abi: GATE_ABI,
        functionName: "submitInvoice",
        args: [tuple(session.invoice), session.signature],
      }),
    );

    const receipt = await publicClient().waitForTransactionReceipt({ hash });
    invalidateChainCache();
    if (receipt.status !== "success") throw new CheckoutError("The transaction did not complete.", 502);

    const decision = parseEventLogs({ abi: GATE_ABI, logs: receipt.logs, eventName: "Decision" })[0];
    if (!decision) throw new CheckoutError("The gate emitted no decision.", 502);

    const p = decodePreimage(decision.args.preimage);
    const codes = codesOf(p.reasonMask);
    const outcome = p.outcome;
    const paid = decision.args.paid > 0n ? decision.args.paid.toString() : undefined;
    const holdId = decision.args.holdId > 0n ? decision.args.holdId.toString() : undefined;

    const decided: Session = {
      ...session,
      status: outcome === "PAID" ? "paid" : outcome === "HELD" ? "held" : "refused",
      result: { outcome, codes, txHash: hash, ...(holdId ? { holdId } : {}), ...(paid ? { paid } : {}) },
    };
    put(decided);

    const journal: JournalEntry[] = [
      {
        v: 1,
        kind: "decision",
        po: Number(p.poId),
        inv: decision.args.invoiceHash,
        outcome,
        codes,
        qty: { inv: p.invQty.toString(), recv: p.recvQty.toString() },
        unit: { inv: p.invUnitPrice.toString(), po: p.poUnitPrice.toString() },
        evm: { chain: env.chainId, tx: hash, block: Number(receipt.blockNumber) },
        dig: decision.args.journalDigest,
        at: Date.now(),
      },
    ];
    return { session: decided, journal };
  } catch (err) {
    // Nothing was decided, so the session goes back to open and can be tried again.
    put({ ...session, status: "open" });
    throw err;
  }
}

/** Does the chain know this order? Used so a session for an unknown order reads as such. */
export async function orderExists(poId: string): Promise<boolean> {
  try {
    return (await getPO(BigInt(poId))) !== null;
  } catch {
    return true;
  }
}
