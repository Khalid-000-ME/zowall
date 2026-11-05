/** Domain types. Amounts are USDT base units (6 decimals). Never assume 18. */

export type Hex = `0x${string}`;
export type Address = Hex;
export type Bytes32 = Hex;

export const ZERO_PERSON =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as Bytes32;

export type POStatus = "Open" | "Closed" | "Cancelled";

export type PurchaseOrder = {
  id: bigint;
  /** the only key whose signature authorises an invoice against this PO */
  vendor: Address;
  /** the only address money may reach */
  payee: Address;
  /** hash of the agreed specification */
  specHash: Bytes32;
  /** ordered units */
  qty: bigint;
  /** agreed price per unit, USDT base units */
  unitPrice: bigint;
  /** allowed unit-price overage, basis points */
  priceTolBps: number;
  /** allowed over-delivery when invoicing against a receipt, basis points */
  qtyTolBps: number;
  /** unix seconds */
  expiry: bigint;
  /** cumulative quantity attested by receivers */
  received: bigint;
  /** cumulative quantity already invoiced */
  invoicedQty: bigint;
  /**
   * Cumulative value already invoiced, measured at the PO unit price.
   * Split from invoicedQty because BUDGET_EXCEEDED is a value test and
   * QTY_OVER_RECEIVED is a quantity test, and conflating them double-reports
   * a single price overage.
   */
  invoicedValue: bigint;
  creatorPersonId: Bytes32;
  status: POStatus;
};

export type Receipt = {
  poId: bigint;
  qty: bigint;
  deliverableHash: Bytes32;
  /** enrollment personId of the human who attested, not a per-event nullifier */
  receiverPersonId: Bytes32;
  at: bigint;
};

/** The EIP-712 payload the vendor signs. */
export type Invoice = {
  poId: bigint;
  vendor: Address;
  payee: Address;
  qty: bigint;
  unitPrice: bigint;
  invoiceHash: Bytes32;
  nonce: bigint;
  /** unix seconds after which the signature is no longer usable */
  deadline: bigint;
};

/**
 * Enrollment personIds for the roles touching this decision.
 * These are World ID nullifiers under the single `zowall-enroll` action, so
 * they are stable per human and comparable across roles. Null means the role
 * is not yet filled.
 */
export type Roles = {
  creatorPersonId: Bytes32;
  receiverPersonId: Bytes32 | null;
  approverPersonId: Bytes32 | null;
};

export type EvalContext = {
  /** null when the invoice references a PO that does not exist */
  po: PurchaseOrder | null;
  invoice: Invoice;
  /** signer the caller recovered from the vendor signature; null if recovery failed */
  recoveredSigner: Address | null;
  /** true when this invoiceHash has been decided before */
  alreadySeen: boolean;
  roles: Roles;
  /** evaluation clock, unix seconds */
  now: bigint;
};

export type Violation = {
  code: import("./codes.ts").ReasonCode;
  severity: import("./codes.ts").Severity;
  /**
   * Field-level evidence. Values are strings so that bigints survive
   * JSON.stringify into a 1024-byte HCS message, and so the three-pane view
   * can highlight exactly the fields that disagree.
   */
  evidence: Readonly<Record<string, string>>;
};

export type Decision = {
  outcome: import("./codes.ts").Outcome;
  codes: import("./codes.ts").ReasonCode[];
  reasonMask: number;
  violations: Violation[];
  /** what would move on PAID, USDT base units; 0n otherwise */
  payableAmount: bigint;
};
