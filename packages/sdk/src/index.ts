/**
 * The drop-in. An agent that already pays invoices adds this and keeps its
 * own logic; the only change is that a refusal is now a possible answer.
 *
 *   const gate = createGate({ chain, gateAddress, account });
 *   const result = await gate.pay(invoice, vendorSignature);
 *   if (result.outcome !== "PAID") console.log(result.codes, result.explain());
 *
 * `pay` never throws on a bad document. A refusal is a result, and an agent
 * that treats refusal as an exception will retry it in a loop.
 */

import {
  REASON_TEXT,
  codesOf,
  type Address,
  type Bytes32,
  type Invoice,
  type Outcome,
  type ReasonCode,
} from "@zowall/gate-core";

export const INVOICE_TYPES = {
  Invoice: [
    { name: "poId", type: "uint256" },
    { name: "vendor", type: "address" },
    { name: "payee", type: "address" },
    { name: "qty", type: "uint128" },
    { name: "unitPrice", type: "uint128" },
    { name: "invoiceHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint64" },
  ],
} as const;

// The ABI is generated from the compiled contract (scripts/gen-abi.mjs) rather
// than copied here, so it cannot drift from what is actually deployed.
export { GATE_ABI } from "./abi.ts";
import { GATE_ABI } from "./abi.ts";

const OUTCOME_BY_CODE: readonly Outcome[] = ["PAID", "HELD", "REJECTED"];

export type GateResult = {
  outcome: Outcome;
  codes: ReasonCode[];
  reasonMask: number;
  txHash?: `0x${string}`;
  /** One line per refusal, in words a person can act on. */
  explain(): string;
};

function result(outcome: Outcome, mask: number, txHash?: `0x${string}`): GateResult {
  const codes = codesOf(mask);
  return {
    outcome,
    codes,
    reasonMask: mask,
    ...(txHash ? { txHash } : {}),
    explain: () =>
      codes.length === 0
        ? "Matched the purchase order and the receipt."
        : codes.map((c) => REASON_TEXT[c]).join(" "),
  };
}

export type GateConfig = {
  gateAddress: Address;
  /** viem PublicClient */
  publicClient: {
    readContract: (args: unknown) => Promise<unknown>;
    waitForTransactionReceipt: (args: { hash: `0x${string}` }) => Promise<unknown>;
  };
  /** viem WalletClient; omit for a read-only gate that can only preview */
  walletClient?: {
    writeContract: (args: unknown) => Promise<`0x${string}`>;
  };
};

export function createGate(config: GateConfig) {
  return {
    /**
     * Ask what would happen, changing nothing. Cheap, and the honest thing to
     * call before shipping goods.
     */
    async preview(invoice: Invoice, vendorSig: `0x${string}`): Promise<GateResult> {
      const [mask, outcome] = (await config.publicClient.readContract({
        address: config.gateAddress,
        abi: GATE_ABI,
        functionName: "previewInvoice",
        args: [toTuple(invoice), vendorSig],
      })) as [number, number];

      return result(OUTCOME_BY_CODE[outcome] ?? "REJECTED", Number(mask));
    },

    /**
     * Submit for a decision. Returns PAID, HELD or REJECTED - it does not
     * throw because the document was wrong.
     */
    async pay(invoice: Invoice, vendorSig: `0x${string}`): Promise<GateResult> {
      if (!config.walletClient) throw new Error("gate is read-only: no walletClient");

      // Preview first so the outcome is known even if the receipt is slow to
      // come back; the on-chain decision is authoritative either way.
      const expected = await this.preview(invoice, vendorSig);

      const hash = await config.walletClient.writeContract({
        address: config.gateAddress,
        abi: GATE_ABI,
        functionName: "submitInvoice",
        args: [toTuple(invoice), vendorSig],
      });
      await config.publicClient.waitForTransactionReceipt({ hash });

      return result(expected.outcome, expected.reasonMask, hash);
    },
  };
}

function toTuple(inv: Invoice) {
  return {
    poId: inv.poId,
    vendor: inv.vendor,
    payee: inv.payee,
    qty: inv.qty,
    unitPrice: inv.unitPrice,
    invoiceHash: inv.invoiceHash,
    nonce: inv.nonce,
    deadline: inv.deadline,
  };
}

/** Sign an invoice as the vendor. Vendors do this; buyers never can. */
export async function signInvoice(
  invoice: Invoice,
  config: { privateKey: `0x${string}`; chainId: number; gateAddress: Address },
): Promise<`0x${string}`> {
  const { privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(config.privateKey);

  return account.signTypedData({
    domain: {
      name: "Zowall",
      version: "1",
      chainId: config.chainId,
      verifyingContract: config.gateAddress,
    },
    types: INVOICE_TYPES,
    primaryType: "Invoice",
    message: toTuple(invoice),
  });
}

export {
  CheckoutError,
  createCheckoutSession,
  serialiseInvoice,
  type CheckoutConfig,
  type CheckoutSession,
  type CheckoutSessionInput,
} from "./checkout.ts";

export {
  RegistryError,
  discoverEndpoints,
  getEndpoint,
  myEndpoints,
  registerEndpoint,
  removeEndpoint,
  toAtomic,
  verifyEndpoint,
  type Discovery,
  type NewEndpoint,
  type RegisteredEndpoint,
  type RegistryConfig,
} from "./registry.ts";

export type { Bytes32, Invoice, Outcome, ReasonCode };
