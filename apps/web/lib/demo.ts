/**
 * The demo executor: runs the real flow against the real gate, from the server.
 *
 * It signs as three parties that a real deployment keeps apart - the buyer's
 * relayer, the vendor, and the attestor - and it sends ordinary transactions.
 * There is no mock path: every result returned here is a transaction on
 * Whitechain you can open, and every decision is also written to Hedera.
 *
 * The three humans (creator, receiver, approver) are enrollment personIds. The
 * attestor signs for whichever one a step names, which is why this lives behind
 * DEMO_ENABLED: a deployment that did that for anyone would be defeating the
 * control it exists to show.
 */

import {
  BaseError,
  ContractFunctionRevertedError,
  createWalletClient,
  encodeAbiParameters,
  http,
  keccak256,
  parseEventLogs,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  REASON_TEXT,
  codesOf,
  formatUsdt,
  parseUsdt,
  type Address,
  type Bytes32,
  type Invoice,
  type ReasonCode,
} from "@zowall/gate-core";
import { decodePreimage, type JournalEntry } from "@zowall/journal";
import { GATE_ABI, signInvoice } from "@zowall/sdk";
import { signAttestation, type Role } from "@zowall/world";

import { getHold, getPO, getPOs, getVault, invalidateChainCache, publicClient, whitechainSepolia } from "@/lib/chain";
import { txUrl } from "@/lib/chains";
import { DemoError } from "@/lib/demo-http";
import { serverEnv } from "@/lib/env";
import { humanByKey, type Human } from "@/lib/humans";
import { invalidateJournal } from "@/lib/journal-read";
import { rememberDescription } from "@/lib/store";

/* --------------------------------------------------------------- context --- */

/** Holds no funds and signs nothing real; it exists to be the wrong party. */
const ATTACKER_KEY = keccak256(toHex("zowall-demo-attacker"));
export const ATTACKER_ACCOUNT = privateKeyToAccount(ATTACKER_KEY);
export const DEAD = "0x000000000000000000000000000000000000dEaD" as Address;

function context() {
  const env = serverEnv();
  if (!env.demoEnabled) {
    throw new DemoError("The demo executor is switched off on this deployment.", 403);
  }

  const missing = [
    !env.gateAddress && "GATE_ADDRESS",
    !env.usdtAddress && "USDT_ADDRESS",
    !env.deployerKey && "PRIVATE_KEY",
    !env.vendorKey && "VENDOR_PRIVATE_KEY",
    !env.attestorKey && "ATTESTOR_PRIVATE_KEY",
  ].filter((m): m is string => typeof m === "string");
  if (missing.length > 0) {
    throw new DemoError(`Not configured: ${missing.join(", ")}`, 503);
  }

  const deployer = privateKeyToAccount(env.deployerKey!);
  const vendor = privateKeyToAccount(env.vendorKey!);

  const transport = http(env.rpcUrl, { retryCount: 6, retryDelay: 500, timeout: 20_000 });
  const wallet = createWalletClient({ account: deployer, chain: whitechainSepolia, transport });
  const vendorWallet = createWalletClient({ account: vendor, chain: whitechainSepolia, transport });

  return {
    env,
    gate: env.gateAddress!,
    usdt: env.usdtAddress!,
    attestorKey: env.attestorKey!,
    deployer,
    vendor,
    wallet,
    vendorWallet,
  };
}

type Ctx = ReturnType<typeof context>;

/* One relayer wallet means one nonce, so transactions go through a queue. A
   global, because dev can load this module more than once. */
const g = globalThis as unknown as { __zowallQueue?: Promise<unknown>; __zowallHcs?: Promise<unknown> };

function serial<T>(job: () => Promise<T>): Promise<T> {
  const next = (g.__zowallQueue ?? Promise.resolve()).then(job, job);
  g.__zowallQueue = next.catch(() => undefined);
  return next;
}

/* -------------------------------------------------------------- summaries --- */

export type TxSummary = {
  hash: string;
  explorerUrl: string | null;
  block: string;
  status: "success" | "reverted";
};

export type DecisionSummary = {
  outcome: "PAID" | "HELD" | "REJECTED";
  codes: ReasonCode[];
  reasons: string[];
  reasonMask: number;
  paid: string;
  holdId: string;
  digest: string;
  /** the facts the digest is taken over, recovered from the log alone */
  preimage: {
    poId: string;
    invoiceHash: string;
    invQty: string;
    recvQty: string;
    invUnitPrice: string;
    poUnitPrice: string;
    creator: string;
    receiver: string;
    approver: string;
    nonce: string;
  };
};

export type StepResult = {
  tx: TxSummary;
  decision?: DecisionSummary;
  poId?: string;
  holdId?: string;
  /** USDT paid by a hold resolution, base units */
  paid?: string;
  /** extra reservation an override drew from free balance */
  amended?: string;
  /** set when the contract refused the action */
  reverted?: { error: string; reason?: ReasonCode; message: string };
  /** what the contract emitted, for the "under the hood" view */
  events: string[];
};

type Journalled = { result: StepResult; journal: JournalEntry[] };

const explain = (code: ReasonCode) => REASON_TEXT[code];

async function summarise(c: Ctx, hash: `0x${string}`): Promise<Journalled> {
  const receipt = await publicClient().waitForTransactionReceipt({ hash });
  invalidateChainCache();

  const tx: TxSummary = {
    hash,
    explorerUrl: txUrl(c.env.chainId, hash),
    block: receipt.blockNumber.toString(),
    status: receipt.status,
  };

  const result: StepResult = { tx, events: [] };
  const journal: JournalEntry[] = [];
  const evm = { chain: c.env.chainId, tx: hash, block: Number(receipt.blockNumber) };
  const at = Date.now();

  if (receipt.status !== "success") return { result, journal };

  for (const ev of parseEventLogs({ abi: GATE_ABI, logs: receipt.logs })) {
    result.events.push(ev.eventName);

    if (ev.eventName === "POCreated") {
      result.poId = ev.args.poId.toString();
      journal.push({
        v: 1,
        kind: "po_created",
        po: Number(ev.args.poId),
        vendor: ev.args.vendor,
        payee: ev.args.payee,
        qty: ev.args.qty.toString(),
        unit: ev.args.unitPrice.toString(),
        enc: ev.args.encumbered.toString(),
        evm,
        dig: ev.args.journalDigest,
        at,
      });
    }

    if (ev.eventName === "ReceiptAttested") {
      journal.push({
        v: 1,
        kind: "receipt",
        po: Number(ev.args.poId),
        qty: ev.args.qty.toString(),
        total: ev.args.totalReceived.toString(),
        deliverable: ev.args.deliverableHash,
        evm,
        dig: ev.args.journalDigest,
        at,
      });
    }

    if (ev.eventName === "POCancelled") {
      journal.push({
        v: 1,
        kind: "po_cancelled",
        po: Number(ev.args.poId),
        released: ev.args.released.toString(),
        evm,
        dig: ev.args.journalDigest,
        at,
      });
    }

    if (ev.eventName === "Decision") {
      const p = decodePreimage(ev.args.preimage);
      const codes = codesOf(p.reasonMask);
      result.holdId = ev.args.holdId > 0n ? ev.args.holdId.toString() : undefined;
      result.decision = {
        outcome: p.outcome,
        codes,
        reasons: codes.map(explain),
        reasonMask: p.reasonMask,
        paid: ev.args.paid.toString(),
        holdId: ev.args.holdId.toString(),
        digest: ev.args.journalDigest,
        preimage: {
          poId: p.poId.toString(),
          invoiceHash: p.invoiceHash,
          invQty: p.invQty.toString(),
          recvQty: p.recvQty.toString(),
          invUnitPrice: p.invUnitPrice.toString(),
          poUnitPrice: p.poUnitPrice.toString(),
          creator: p.creatorPersonId,
          receiver: p.receiverPersonId,
          approver: p.approverPersonId,
          nonce: p.nonce.toString(),
        },
      };
      journal.push({
        v: 1,
        kind: "decision",
        po: Number(p.poId),
        inv: p.invoiceHash,
        outcome: p.outcome,
        codes,
        qty: { inv: p.invQty.toString(), recv: p.recvQty.toString() },
        unit: { inv: p.invUnitPrice.toString(), po: p.poUnitPrice.toString() },
        evm,
        dig: ev.args.journalDigest,
        at,
      });
    }

    if (ev.eventName === "HoldResolved") {
      result.paid = ev.args.paid.toString();
      result.amended = ev.args.amended.toString();
      const hold = await getHold(ev.args.holdId);
      journal.push({
        v: 1,
        kind: "hold_resolved",
        po: Number(ev.args.poId),
        hold: Number(ev.args.holdId),
        inv: hold?.invoiceHash ?? `0x${"00".repeat(32)}`,
        approved: ev.args.approved,
        paid: ev.args.paid.toString(),
        amended: ev.args.amended.toString(),
        evm,
        dig: ev.args.journalDigest,
        at,
      });
    }
  }

  return { result, journal };
}

/* ---------------------------------------------------------------- journal --- */

/**
 * Write entries to the Hedera topic. Runs after the response is sent, because a
 * consensus round trip is several seconds and the UI has no reason to wait for
 * it - it polls the mirror node and shows the entry arriving.
 *
 * A failure holds the entry in a queue and retries on the next write, so a late
 * journal is possible and a lost one is not, and a payment is never blocked on
 * it.
 */
export async function writeJournal(entries: JournalEntry[]): Promise<void> {
  const env = serverEnv();
  if (!env.hederaAccountId || !env.hederaKey || !env.hederaSubmitKey || !env.hederaTopicId) return;
  if (entries.length === 0) return;

  const run = async () => {
    const { JournalWriter, QueueingWriter } = await import("@zowall/journal/hcs");
    const holder = globalThis as unknown as { __zowallWriter?: InstanceType<typeof QueueingWriter> };
    holder.__zowallWriter ??= new QueueingWriter(
      new JournalWriter({
        operatorId: env.hederaAccountId!,
        operatorKey: env.hederaKey!,
        submitKey: env.hederaSubmitKey!,
        topicId: env.hederaTopicId!,
        network: "testnet",
      }),
    );
    const writer = holder.__zowallWriter;

    for (const entry of entries) await writer.write(entry);
    await writer.flush();
    invalidateJournal();
  };

  const next = ((g.__zowallHcs as Promise<unknown>) ?? Promise.resolve()).then(run, run);
  g.__zowallHcs = next.catch(() => undefined);
  await next;
}

/* ----------------------------------------------------------- attestations --- */

async function attest(c: Ctx, human: Human, role: Role, poId: bigint) {
  return signAttestation(
    { personId: human.personId, role, poId },
    { privateKey: c.attestorKey, chainId: c.env.chainId, gateAddress: c.gate, ttlSeconds: 600 },
  );
}

/**
 * Who is acting, and whether the attestor will vouch for them.
 *
 * With verification required, the attestor signs only for people who have proven
 * they are a unique human through World ID. Anyone else is refused here, before a
 * transaction exists: the protected action does not happen, and there is nothing
 * on-chain to point at because nothing was sent. `strict` can only tighten the
 * deployment's setting, never loosen it.
 */
function person(key: string | undefined, label: string, strict = false): Human {
  const human = key ? humanByKey(key) : undefined;
  if (!human) throw new DemoError(`Pick who ${label} is.`);

  if ((strict || serverEnv().requireVerified) && !human.enrolled) {
    throw new DemoError(
      `Denied: ${human.name} has not verified with World ID, so the attestor issued no ` +
        `attestation and nothing was sent.`,
      403,
    );
  }
  return human;
}

/* ------------------------------------------------------------ purchase order -- */

const MAX_QTY = 20n;
const MAX_UNIT = parseUsdt("5");

export async function raisePO(input: {
  description: string;
  qty: string;
  unitPrice: string;
  tolerancePct: string;
  creator: string;
  requireVerified?: boolean;
}): Promise<Journalled> {
  const c = context();
  const creator = person(input.creator, "raising the order", input.requireVerified);

  let qty: bigint;
  let unit: bigint;
  try {
    qty = BigInt(input.qty);
    unit = parseUsdt(input.unitPrice);
  } catch {
    throw new DemoError("Quantity must be a whole number and price a decimal amount.");
  }
  if (qty < 1n || qty > MAX_QTY) throw new DemoError(`Quantity must be 1 to ${MAX_QTY}.`);
  if (unit < 1n || unit > MAX_UNIT) throw new DemoError(`Unit price must be at most ${formatUsdt(MAX_UNIT)} USDT.`);

  const tolBps = Math.round(Number(input.tolerancePct || "0") * 100);
  if (!Number.isFinite(tolBps) || tolBps < 0 || tolBps > 2_000) {
    throw new DemoError("Tolerance must be between 0 and 20 percent.");
  }

  const description = (input.description || "Purchase order").slice(0, 120);

  // The reservation is the tolerance ceiling, not the headline total, so say so
  // before the chain does with a revert.
  const reserve = qty * unit + (qty * unit * BigInt(tolBps)) / 10_000n;
  const vault = await getVault();
  if (reserve > vault.free) {
    throw new DemoError(
      `That order reserves ${formatUsdt(reserve)} USDT and only ${formatUsdt(vault.free)} is free. ` +
        `Use Reset to release earlier orders.`,
    );
  }

  const attestation = await attest(c, creator, "Creator", 0n);

  const out = await serial(async () => {
    const hash = await c.wallet.writeContract({
      address: c.gate,
      abi: GATE_ABI,
      functionName: "createPO",
      args: [
        {
          vendor: c.vendor.address,
          payee: c.vendor.address,
          specHash: keccak256(toHex(description)),
          qty,
          unitPrice: unit,
          priceTolBps: tolBps,
          qtyTolBps: 0,
          expiry: BigInt(Math.floor(Date.now() / 1000) + 86_400),
        },
        attestation,
      ],
    });
    return summarise(c, hash);
  });

  if (out.result.poId) rememberDescription(BigInt(out.result.poId), description);
  return out;
}

export async function attestDelivery(input: {
  poId: string;
  qty: string;
  receiver: string;
  requireVerified?: boolean;
}): Promise<Journalled> {
  const c = context();
  const receiver = person(input.receiver, "signing for the delivery", input.requireVerified);
  const poId = BigInt(input.poId);
  const qty = BigInt(input.qty);

  const po = await getPO(poId);
  if (!po) throw new DemoError(`No purchase order #${poId}.`);

  const attestation = await attest(c, receiver, "Receiver", poId);

  return serial(async () => {
    let hash: `0x${string}`;
    try {
      hash = await c.wallet.writeContract({
        address: c.gate,
        abi: GATE_ABI,
        functionName: "attestReceipt",
        args: [poId, qty, keccak256(toHex(`delivered:${poId}:${qty}:${Date.now()}`)), attestation],
      });
    } catch (err) {
      throw refusal(err);
    }
    return summarise(c, hash);
  });
}

/* --------------------------------------------------------------- invoices --- */

export type InvoiceKind = "matching" | "overpriced" | "swapped" | "forged";

/** Stable within the hour, so a resubmission is the same bytes, not merely the same hash. */
const stableDeadline = () => BigInt((Math.floor(Date.now() / 3_600_000) + 2) * 3_600);

function invoiceHash(poId: bigint, qty: bigint, unit: bigint, payee: Address, nonce: bigint): Bytes32 {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint128" }, { type: "uint128" }, { type: "address" }, { type: "uint256" }],
      [poId, qty, unit, payee, nonce],
    ),
  );
}

export async function submitInvoiceFor(input: {
  poId: string;
  kind: InvoiceKind;
  qty: string;
  nonce: string;
}): Promise<Journalled> {
  const c = context();
  const poId = BigInt(input.poId);
  const po = await getPO(poId);
  if (!po) throw new DemoError(`No purchase order #${poId}.`);

  const qty = BigInt(input.qty);
  const nonce = BigInt(input.nonce);

  const unit = input.kind === "overpriced" ? (po.unitPrice * 12n) / 10n : po.unitPrice;
  const payee = input.kind === "swapped" || input.kind === "forged" ? DEAD : po.payee;

  const invoice: Invoice = {
    poId,
    vendor: po.vendor,
    payee,
    qty,
    unitPrice: unit,
    invoiceHash: invoiceHash(poId, qty, unit, payee, nonce),
    nonce,
    deadline: stableDeadline(),
  };

  // A forged invoice is signed by someone who is not the vendor key on the PO.
  const signer = input.kind === "forged" ? ATTACKER_KEY : c.env.vendorKey!;
  const sig = await signInvoice(invoice, {
    privateKey: signer,
    chainId: c.env.chainId,
    gateAddress: c.gate,
  });

  return relayInvoice(c, invoice, sig);
}

/** An agent obeying an injected instruction: no purchase order, no signature. */
export async function submitInjected(input: { payee: Address; amount: bigint }): Promise<Journalled> {
  const c = context();
  const cap = parseUsdt("1000000");
  const invoice: Invoice = {
    poId: 0n,
    vendor: c.vendor.address,
    payee: input.payee,
    qty: 1n,
    unitPrice: input.amount > cap ? cap : input.amount,
    invoiceHash: keccak256(toHex(`injected:${input.payee}:${input.amount}:${Date.now()}`)),
    nonce: BigInt(Date.now()),
    deadline: 0n,
  };
  return relayInvoice(c, invoice, "0x");
}

function relayInvoice(c: Ctx, invoice: Invoice, sig: `0x${string}`): Promise<Journalled> {
  return serial(async () => {
    const hash = await c.wallet.writeContract({
      address: c.gate,
      abi: GATE_ABI,
      functionName: "submitInvoice",
      args: [
        {
          poId: invoice.poId,
          vendor: invoice.vendor,
          payee: invoice.payee,
          qty: invoice.qty,
          unitPrice: invoice.unitPrice,
          invoiceHash: invoice.invoiceHash,
          nonce: invoice.nonce,
          deadline: invoice.deadline,
        },
        sig,
      ],
    });
    return summarise(c, hash);
  });
}

/* ------------------------------------------------------------------ holds --- */

const SOD_REASON: ReasonCode = "SOD_VIOLATION";

/**
 * Turn a viem revert into something a person can read. The contract's custom
 * errors are in the ABI, so the name survives; SodViolation is the control
 * itself refusing, and it is reported as the SOD_VIOLATION reason code.
 */
function refusal(err: unknown): DemoError {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName ?? "reverted";
      if (name === "SodViolation") {
        return new DemoError("The same human already holds another role on this purchase order.", 409);
      }
      return new DemoError(`The contract refused it: ${name}.`, 409);
    }
  }
  return new DemoError(err instanceof Error ? err.message.split("\n")[0] ?? "failed" : "failed", 500);
}

export async function resolveHoldAs(input: {
  holdId: string;
  approve: boolean;
  approver: string;
  requireVerified?: boolean;
}): Promise<Journalled> {
  const c = context();
  const approver = person(input.approver, "deciding on the hold", input.requireVerified);
  const holdId = BigInt(input.holdId);

  const hold = await getHold(holdId);
  if (!hold) throw new DemoError(`No hold #${holdId}.`);
  if (hold.resolved) throw new DemoError(`Hold #${holdId} is already resolved.`, 409);

  const attestation = await attest(c, approver, "Approver", hold.poId);
  const args = [holdId, input.approve, attestation] as const;

  return serial(async () => {
    // Ask the chain first. A refusal is the point of this step, and the
    // simulation is what yields the contract's own error name.
    let refused: DemoError | null = null;
    try {
      await publicClient().simulateContract({
        account: c.deployer,
        address: c.gate,
        abi: GATE_ABI,
        functionName: "resolveHold",
        args,
      });
    } catch (err) {
      refused = refusal(err);
    }

    if (!refused) {
      const hash = await c.wallet.writeContract({
        address: c.gate,
        abi: GATE_ABI,
        functionName: "resolveHold",
        args,
      });
      return summarise(c, hash);
    }

    // Send it anyway, with the gas set by hand so the node does not refuse it
    // at estimation. The transaction lands, reverts, and stays on the explorer:
    // the protected action did not happen, and that is checkable by anyone.
    const hash = await c.wallet.writeContract({
      address: c.gate,
      abi: GATE_ABI,
      functionName: "resolveHold",
      args,
      gas: 500_000n,
    });
    const out = await summarise(c, hash);
    out.result.reverted = {
      error: refused.message.includes("same human") ? "SodViolation" : "Refused",
      ...(refused.message.includes("same human") ? { reason: SOD_REASON } : {}),
      message: refused.message,
    };
    return out;
  });
}

/* ------------------------------------------------------------------ reset --- */

/**
 * Put the vault back the way a walkthrough found it.
 *
 * Open orders are cancelled, which releases their reservations, and the vendor
 * returns whatever it was paid. There is deliberately no withdraw function on
 * the contract, so this is the only way funds move back: the vendor, who is ours,
 * sends them.
 */
export async function resetDemo(): Promise<{
  steps: Array<{ label: string; tx: string; url: string | null }>;
  journal: JournalEntry[];
}> {
  const c = context();
  const steps: Array<{ label: string; tx: string; url: string | null }> = [];
  const note = (label: string, hash: string) =>
    steps.push({ label, tx: hash, url: txUrl(c.env.chainId, hash) });

  const journal: JournalEntry[] = [];

  for (const po of await getPOs()) {
    if (po.status !== "Open") continue;
    const creator: Human = { key: po.creatorPersonId, name: "creator", personId: po.creatorPersonId, enrolled: false };
    const attestation = await attest(c, creator, "Creator", po.id);
    const out = await serial(async () => {
      const hash = await c.wallet.writeContract({
        address: c.gate,
        abi: GATE_ABI,
        functionName: "cancelPO",
        args: [po.id, attestation],
      });
      return summarise(c, hash);
    });
    note(`cancelled PO #${po.id}`, out.result.tx.hash);
    journal.push(...out.journal);
  }

  const balance = await publicClient().readContract({
    address: c.usdt,
    abi: [
      { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
    ] as const,
    functionName: "balanceOf",
    args: [c.vendor.address],
  });

  if (balance > 0n) {
    await serial(async () => {
      const gas = await publicClient().getBalance({ address: c.vendor.address });
      if (gas < 2_000_000_000_000_000n) {
        const topUp = await c.wallet.sendTransaction({ to: c.vendor.address, value: 2_000_000_000_000_000n });
        await publicClient().waitForTransactionReceipt({ hash: topUp });
      }
      const hash = await c.vendorWallet.writeContract({
        address: c.usdt,
        abi: [
          { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
        ] as const,
        functionName: "transfer",
        args: [c.gate, balance],
      });
      await publicClient().waitForTransactionReceipt({ hash });
      note(`vendor returned ${formatUsdt(balance)} USDT to the vault`, hash);
    });
  }

  invalidateChainCache();
  return { steps, journal };
}

export type { Journalled };
