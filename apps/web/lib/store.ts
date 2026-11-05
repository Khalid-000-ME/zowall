/**
 * In-process demo store.
 *
 * The chain is the source of truth for every decision; this holds only what a
 * UI needs to render without an indexer - PO metadata, enrollments, and the
 * decisions we have observed. It is deliberately not a database: anything that
 * matters is on Whitechain or on the Hedera topic, and a judge can check both
 * without us.
 *
 * Restarting the server loses this and loses nothing that was load-bearing.
 */

import type { Bytes32, Outcome, ReasonCode } from "@zowall/gate-core";
import { MemoryEnrollmentStore } from "@zowall/world";

export const enrollments = new MemoryEnrollmentStore();

export type StoredPO = {
  id: bigint;
  vendor: `0x${string}`;
  payee: `0x${string}`;
  /** plain-language description; the chain holds only its hash */
  description: string;
  specHash: Bytes32;
  qty: bigint;
  unitPrice: bigint;
  priceTolBps: number;
  qtyTolBps: number;
  expiry: bigint;
  received: bigint;
  invoicedQty: bigint;
  invoicedValue: bigint;
  creatorPersonId: Bytes32;
  receiverPersonId: Bytes32 | null;
  status: "Open" | "Closed" | "Cancelled";
  txHash?: string;
  /** single-use link for the vendor portal */
  vendorToken: string;
};

export type StoredDecision = {
  poId: bigint;
  invoiceHash: Bytes32;
  outcome: Outcome;
  codes: ReasonCode[];
  qty: bigint;
  unitPrice: bigint;
  paid: bigint;
  holdId: bigint | null;
  journalDigest: Bytes32;
  txHash?: string;
  hederaTxId?: string;
  at: number;
};

class PurchaseOrderStore {
  #byId = new Map<string, StoredPO>();
  #byToken = new Map<string, bigint>();

  put(po: StoredPO): void {
    this.#byId.set(po.id.toString(), po);
    this.#byToken.set(po.vendorToken, po.id);
  }

  get(id: bigint): StoredPO | undefined {
    return this.#byId.get(id.toString());
  }

  byVendorToken(token: string): StoredPO | undefined {
    const id = this.#byToken.get(token);
    return id === undefined ? undefined : this.get(id);
  }

  all(): StoredPO[] {
    return [...this.#byId.values()].sort((a, b) => Number(b.id - a.id));
  }
}

class DecisionStore {
  #all: StoredDecision[] = [];

  add(decision: StoredDecision): void {
    this.#all.push(decision);
  }

  forPO(poId: bigint): StoredDecision[] {
    return this.#all.filter((d) => d.poId === poId);
  }

  byInvoiceHash(hash: string): StoredDecision | undefined {
    return this.#all.find((d) => d.invoiceHash.toLowerCase() === hash.toLowerCase());
  }

  held(): StoredDecision[] {
    return this.#all.filter((d) => d.outcome === "HELD" && d.holdId !== null);
  }

  all(): StoredDecision[] {
    return [...this.#all].sort((a, b) => b.at - a.at);
  }
}

export const purchaseOrders = new PurchaseOrderStore();
export const decisions = new DecisionStore();
