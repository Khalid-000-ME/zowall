/** Shared fixtures. Deliberately boring numbers so a failure reads at a glance. */

import { usdt } from "../src/money.ts";
import type { Address, Bytes32, EvalContext, Invoice, PurchaseOrder } from "../src/types.ts";

export const VENDOR = "0x1111111111111111111111111111111111111111" as Address;
export const PAYEE = "0x2222222222222222222222222222222222222222" as Address;
export const ATTACKER = "0x000000000000000000000000000000000000dEaD" as Address;

const person = (n: number): Bytes32 =>
  `0x${n.toString(16).padStart(64, "0")}` as Bytes32;

export const ALICE = person(0xa1); // raises the PO
export const BOB = person(0xb2);   // receives the goods
export const CARA = person(0xc3);  // approves exceptions

export const INVOICE_HASH = person(0x1a2b) as Bytes32;
export const OTHER_HASH = person(0x3c4d) as Bytes32;

export const NOW = 1_800_000_000n;

export function po(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 17n,
    vendor: VENDOR,
    payee: PAYEE,
    specHash: person(0xfe),
    qty: 100n,
    unitPrice: usdt(40),
    priceTolBps: 500, // 5%
    qtyTolBps: 0,
    expiry: NOW + 86_400n,
    received: 100n,
    invoicedQty: 0n,
    invoicedValue: 0n,
    creatorPersonId: ALICE,
    status: "Open",
    ...overrides,
  };
}

export function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    poId: 17n,
    vendor: VENDOR,
    payee: PAYEE,
    qty: 100n,
    unitPrice: usdt(40),
    invoiceHash: INVOICE_HASH,
    nonce: 1n,
    deadline: NOW + 3_600n,
    ...overrides,
  };
}

export function ctx(overrides: Partial<EvalContext> = {}): EvalContext {
  const base = po();
  return {
    po: base,
    invoice: invoice(),
    recoveredSigner: VENDOR,
    alreadySeen: false,
    roles: { creatorPersonId: ALICE, receiverPersonId: BOB, approverPersonId: null },
    now: NOW,
    ...overrides,
  };
}
