/**
 * Guardian-protected payers on Hedera.
 *
 * A control that lives in the agent's own process is a control the agent can
 * skip. A prompt-injected agent, a compromised dependency or a hacked relayer
 * can all simply not call the guard and sign the payment themselves. Every
 * client-side wrapper has that flaw, this package's `withZowall` included.
 *
 * Hedera removes it without a contract. An account's key is not a single key:
 * it can be a threshold structure that the network itself evaluates on every
 * transaction. Give the agent's payer account the key
 *
 *     2 of [ agent key,  2 of [ guardian 1, guardian 2, guardian 3 ] ]
 *
 * and the account cannot move a single tinybar unless the agent AND a quorum of
 * independent guardians have signed the same transaction. The facilitator
 * checks the signatures against that key before it sponsors a payment, and
 * consensus checks them again, so the refusal is made by the ledger and not by
 * anybody's honesty.
 *
 * What each party can do alone:
 *
 *   the agent                  nothing. It cannot sign a payment by itself.
 *   one guardian               nothing. It cannot sign without the agent or a quorum.
 *   a hacked middleware        nothing, for the same reason.
 *   agent + a guardian quorum  pay - but a guardian signs only after decoding
 *                              the transaction itself and checking it against
 *                              the mandate, so a payment the mandate does not
 *                              allow needs a quorum of guardians to be wrong.
 *
 * The SDK is imported dynamically, as in the journal package, so the rest of
 * this package stays free of a Hedera client.
 */

import type { GuardDecision } from "./guard.ts";
import type { PaymentRequirements } from "./types.ts";

type Sdk = typeof import("@hashgraph/sdk");
type PrivateKey = import("@hashgraph/sdk").PrivateKey;
type Client = import("@hashgraph/sdk").Client;

async function sdk(): Promise<Sdk> {
  return await import("@hashgraph/sdk");
}

export const HBAR_ASSET = "0.0.0";

/* ------------------------------------------------------------------ keys -- */

/**
 * The key a guarded payer account is created with: the agent, plus a quorum of
 * guardians, both required.
 */
export async function guardedKey(
  agent: PrivateKey,
  guardians: readonly PrivateKey[],
  guardianThreshold: number,
) {
  const { KeyList } = await sdk();
  if (guardianThreshold < 1 || guardianThreshold > guardians.length) {
    throw new Error(`guardian threshold ${guardianThreshold} cannot be met by ${guardians.length} guardians`);
  }
  const quorum = new KeyList(
    guardians.map((g) => g.publicKey),
    guardianThreshold,
  );
  // Threshold 2 of 2: the agent key and the guardian quorum are BOTH required.
  return new KeyList([agent.publicKey, quorum], 2);
}

/**
 * Create a payer account whose key is the guardian structure above. The
 * operator pays for creation and funds the account; after that the operator has
 * no more authority over it than anyone else.
 */
export async function createGuardedAccount(opts: {
  client: Client;
  agent: PrivateKey;
  guardians: readonly PrivateKey[];
  guardianThreshold: number;
  initialHbar: number;
  memo?: string;
}): Promise<string> {
  const { AccountCreateTransaction, Hbar } = await sdk();
  const key = await guardedKey(opts.agent, opts.guardians, opts.guardianThreshold);

  const tx = await new AccountCreateTransaction()
    .setKeyWithoutAlias(key)
    .setInitialBalance(new Hbar(opts.initialHbar))
    .setAccountMemo(opts.memo ?? "zowall guarded payer")
    .execute(opts.client);
  const receipt = await tx.getReceipt(opts.client);
  if (!receipt.accountId) throw new Error("account create returned no account id");
  return receipt.accountId.toString();
}

/* ----------------------------------------------------------- the payment -- */

export type TransferSummary = {
  feePayer: string;
  /** tinybars per account, signed */
  hbar: Map<string, bigint>;
  /** token id -> account -> signed amount in the token's smallest unit */
  tokens: Map<string, Map<string, bigint>>;
  /** true when the transaction is a TransferTransaction and nothing else */
  transferOnly: boolean;
  /** seconds the transaction stays valid */
  validForSeconds: number;
};

/**
 * Read a serialised transaction for what it actually does. A guardian signs
 * what this returns, never what the caller says the transaction is.
 */
export async function summarise(bytes: Uint8Array): Promise<TransferSummary> {
  const { Transaction, TransferTransaction } = await sdk();
  const tx = Transaction.fromBytes(bytes);

  const hbar = new Map<string, bigint>();
  const tokens = new Map<string, Map<string, bigint>>();
  const transferOnly = tx instanceof TransferTransaction;

  if (tx instanceof TransferTransaction) {
    for (const [account, amount] of tx.hbarTransfers) {
      hbar.set(account.toString(), BigInt(amount.toTinybars().toString()));
    }
    for (const [token, perAccount] of tx.tokenTransfers) {
      const inner = new Map<string, bigint>();
      for (const [account, amount] of perAccount) inner.set(account.toString(), BigInt(amount.toString()));
      tokens.set(token.toString(), inner);
    }
  }

  return {
    feePayer: tx.transactionId?.accountId?.toString() ?? "",
    hbar,
    tokens,
    transferOnly,
    validForSeconds: Number(tx.transactionValidDuration ?? 0),
  };
}

/**
 * The same rules the x402 `exact` scheme obliges a facilitator to enforce, run
 * by the guardian before it signs: only transfers, only to `payTo`, exactly the
 * quoted amount, in the quoted asset, with the fee payer never the sender.
 *
 * An empty list is a pass. Every entry is a reason the guardian will not sign.
 */
export function problemsWith(
  s: TransferSummary,
  requirements: PaymentRequirements,
  payer: string,
): string[] {
  const out: string[] = [];
  const feePayer = typeof requirements.extra?.["feePayer"] === "string" ? requirements.extra["feePayer"] : "";
  const want = BigInt(requirements.amount);
  const isHbar = requirements.asset === HBAR_ASSET || requirements.asset === "";

  if (!s.transferOnly) out.push("not a plain transfer transaction");
  if (feePayer && s.feePayer !== feePayer) out.push(`fee payer is ${s.feePayer}, quote names ${feePayer}`);

  const ledger = isHbar ? s.hbar : (s.tokens.get(requirements.asset) ?? new Map<string, bigint>());

  if (!isHbar && s.hbar.size > 0 && [...s.hbar.entries()].some(([a, v]) => a !== feePayer && v !== 0n)) {
    out.push("moves HBAR the quote did not ask for");
  }
  if (!isHbar && s.tokens.size > 1) out.push("touches a token the quote did not name");

  const net = [...ledger.values()].reduce((a, b) => a + b, 0n);
  if (net !== 0n) out.push("transfers do not net to zero");

  const received = ledger.get(requirements.payTo) ?? 0n;
  if (received !== want) out.push(`pays ${requirements.payTo} ${received}, quote asks ${want}`);

  const sent = ledger.get(payer) ?? 0n;
  if (sent !== -want) out.push(`${payer} sends ${-sent}, quote asks ${want}`);

  for (const [account, amount] of ledger) {
    if (account !== payer && account !== requirements.payTo && amount !== 0n) {
      out.push(`also moves value to ${account}`);
    }
  }
  if (feePayer && (ledger.get(feePayer) ?? 0n) < 0n) out.push("the fee payer would be a sender");

  return out;
}

/**
 * Build the transaction an x402 `exact` payment is made of, signed by the agent
 * only. The fee payer is the facilitator's account, named in the quote; the
 * facilitator adds its own signature when it settles.
 */
export async function buildAgentSignedTransfer(opts: {
  client: Client;
  requirements: PaymentRequirements;
  payer: string;
  agent: PrivateKey;
}): Promise<Uint8Array> {
  const { TransferTransaction, TransactionId, AccountId, Hbar, HbarUnit, TokenId } = await sdk();
  const { requirements, payer } = opts;

  const feePayer = requirements.extra?.["feePayer"];
  if (typeof feePayer !== "string") throw new Error("the quote does not name a fee payer");

  const amount = BigInt(requirements.amount);
  const tx = new TransferTransaction()
    .setTransactionId(TransactionId.generate(AccountId.fromString(feePayer)))
    .setTransactionValidDuration(Math.max(30, Math.min(120, requirements.maxTimeoutSeconds)))
    .setTransactionMemo("x402 exact");

  if (requirements.asset === HBAR_ASSET || requirements.asset === "") {
    tx.addHbarTransfer(payer, Hbar.from(-Number(amount), HbarUnit.Tinybar));
    tx.addHbarTransfer(requirements.payTo, Hbar.from(Number(amount), HbarUnit.Tinybar));
  } else {
    tx.addTokenTransfer(TokenId.fromString(requirements.asset), payer, Number(-amount));
    tx.addTokenTransfer(TokenId.fromString(requirements.asset), requirements.payTo, Number(amount));
  }

  const frozen = tx.freezeWith(opts.client);
  await frozen.sign(opts.agent);
  return frozen.toBytes();
}

export class GuardianRefused extends Error {
  readonly problems: string[];
  readonly decision: GuardDecision | null;

  constructor(problems: string[], decision: GuardDecision | null) {
    super(`guardian refused to sign: ${problems.join("; ")}`);
    this.name = "GuardianRefused";
    this.problems = problems;
    this.decision = decision;
  }
}

/**
 * One guardian. It is handed the transaction bytes and the quote, and trusts
 * neither: it decodes the transaction, confirms it does what the quote says,
 * runs the mandate check itself, and only then adds its signature.
 *
 * In a real deployment each guardian is a separate service run by a separate
 * party. The interface is the same either way: bytes in, bytes out.
 */
export function createGuardian(config: {
  key: PrivateKey;
  guard: { check: (r: PaymentRequirements) => Promise<GuardDecision> };
  /** the payer account this guardian protects */
  payer: string;
}) {
  return {
    publicKey: config.key.publicKey.toStringRaw(),

    async cosign(bytes: Uint8Array, requirements: PaymentRequirements): Promise<Uint8Array> {
      const { Transaction } = await sdk();

      const summary = await summarise(bytes);
      const problems = problemsWith(summary, requirements, config.payer);
      if (problems.length > 0) throw new GuardianRefused(problems, null);

      const decision = await config.guard.check(requirements);
      if (!decision.allowed) throw new GuardianRefused(decision.decision.codes, decision);

      const signed = await Transaction.fromBytes(bytes).sign(config.key);
      return signed.toBytes();
    },
  };
}

type Guardian = ReturnType<typeof createGuardian>;

/**
 * Collect guardian signatures until the quorum is met. A guardian that refuses
 * is skipped, and the payment fails only if too few remain: a single hacked or
 * unreachable guardian neither enables a bad payment nor blocks a good one.
 */
export async function guardianQuorum(
  bytes: Uint8Array,
  requirements: PaymentRequirements,
  guardians: readonly Guardian[],
  threshold: number,
): Promise<{ bytes: Uint8Array; signed: number; refusals: GuardianRefused[] }> {
  let current = bytes;
  let signed = 0;
  const refusals: GuardianRefused[] = [];

  for (const g of guardians) {
    if (signed >= threshold) break;
    try {
      current = await g.cosign(current, requirements);
      signed += 1;
    } catch (err) {
      if (err instanceof GuardianRefused) refusals.push(err);
      else throw err;
    }
  }

  if (signed < threshold) {
    const why = refusals[0]?.problems.join("; ") ?? "no guardian was reachable";
    throw new GuardianRefused([`${signed} of ${threshold} guardians signed (${why})`], refusals[0]?.decision ?? null);
  }
  return { bytes: current, signed, refusals };
}

/** The base64 the `exact` scheme carries in `payload.transaction`. */
export const toPayload = (bytes: Uint8Array): { transaction: string } => ({
  transaction: Buffer.from(bytes).toString("base64"),
});
