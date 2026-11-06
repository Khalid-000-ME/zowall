/**
 * The only state the app keeps for itself.
 *
 * Everything that matters - purchase orders, decisions, holds, the vault - is
 * read from Whitechain and Hedera. What lives here is what the chain cannot
 * hold: who a person is, and a plain-language description of an order, since
 * the contract stores only its hash.
 *
 * Losing it costs a label, never a fact.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { JsonFileEnrollmentStore } from "@zowall/world";

const ENROLLMENTS = resolve(process.cwd(), ".data/enrollments.json");

/**
 * The people who have verified with World ID.
 *
 * Returns a store freshly loaded from disk on every call, never a cached one: in
 * dev each route can load its own copy of this module, and a long-lived store in
 * one would never see an enrolment written by another.
 */
export function enrollments(): JsonFileEnrollmentStore {
  return new JsonFileEnrollmentStore(ENROLLMENTS);
}

const DESCRIPTIONS = resolve(process.cwd(), ".data/descriptions.json");

function load(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(DESCRIPTIONS, "utf8")) as Record<string, string>;
  } catch {
    return {};
  }
}

/** What a purchase order is for, keyed by id. The chain keeps only the hash. */
export function describe(poId: bigint): string | null {
  return load()[poId.toString()] ?? null;
}

export function rememberDescription(poId: bigint, text: string): void {
  const all = load();
  all[poId.toString()] = text.slice(0, 120);
  mkdirSync(dirname(DESCRIPTIONS), { recursive: true });
  writeFileSync(DESCRIPTIONS, JSON.stringify(all, null, 2));
}
