/**
 * The enrollment registry, and the problem it exists to solve.
 *
 * A World ID nullifier is scoped to RP + action and issued once per human per
 * action. Two consequences, both of which break the obvious design:
 *
 *   1. You cannot use a per-event uniqueness proof to tell whether two
 *      attestations came from the same person - different actions produce
 *      unrelated nullifiers for the same human.
 *   2. You cannot ask the same person to prove uniqueness twice for the same
 *      action. World will correctly refuse with `nullifier_replayed`.
 *
 * So identity and freshness are separated into two layers:
 *
 *   Enrollment (once per person). A uniqueness proof under a single action,
 *   `zowall-enroll`. The returned nullifier becomes that person's stable
 *   personId. Different humans give different personIds, and they are
 *   comparable because they all came from one action.
 *
 *   Freshness (every sensitive act). Proof that *a* human is present now.
 *   Session proofs, which sign without an action and are repeatable by design.
 *
 * Segregation of duties compares enrollment personIds and never per-event
 * nullifiers. That is what makes the fallback in `freshness.ts` safe: even if
 * session proofs are unreachable, identity still comes from here.
 */

import type { Bytes32 } from "@zowall/gate-core";

export const ENROLL_ACTION = "zowall-enroll";

export type Enrollment = {
  /** keccak-independent: the raw nullifier, normalised to 32 bytes */
  personId: Bytes32;
  /** wallet this person operates from, lowercased */
  address: string;
  label: string;
  enrolledAt: number;
  /** false when World was not configured and this is a labelled stand-in */
  live: boolean;
};

/**
 * A nullifier is already a 32-byte value, but it arrives as a decimal or hex
 * string depending on the path it took. Normalise once, here, so the contract
 * and the registry can never disagree about what the same human's id is.
 */
export function toPersonId(nullifier: string): Bytes32 {
  const raw = nullifier.trim();
  if (raw === "") throw new Error("empty nullifier cannot become a personId");

  const hex = raw.startsWith("0x")
    ? raw.slice(2)
    : /^\d+$/.test(raw)
      ? BigInt(raw).toString(16)
      : raw;

  if (!/^[0-9a-fA-F]+$/.test(hex)) throw new Error(`nullifier is not a number or hex: ${raw}`);
  if (hex.length > 64) throw new Error(`nullifier is wider than 32 bytes: ${raw}`);

  return `0x${hex.toLowerCase().padStart(64, "0")}` as Bytes32;
}

export interface EnrollmentStore {
  get(personId: Bytes32): Enrollment | undefined;
  byAddress(address: string): Enrollment | undefined;
  put(enrollment: Enrollment): void;
  all(): Enrollment[];
}

/**
 * In-memory registry. Deliberately not a database: an enrollment is a demo
 * artifact this weekend, and persisting pseudonymous identifiers is a decision
 * that deserves more than a hackathon's thought.
 */
export class MemoryEnrollmentStore implements EnrollmentStore {
  #byPerson = new Map<string, Enrollment>();

  get(personId: Bytes32): Enrollment | undefined {
    return this.#byPerson.get(personId.toLowerCase());
  }

  byAddress(address: string): Enrollment | undefined {
    const wanted = address.toLowerCase();
    for (const e of this.#byPerson.values()) if (e.address === wanted) return e;
    return undefined;
  }

  put(enrollment: Enrollment): void {
    const existing = this.#byPerson.get(enrollment.personId.toLowerCase());
    // A stand-in must never overwrite a real enrollment: that would let an
    // unconfigured run downgrade a verification that genuinely happened.
    if (existing?.live && !enrollment.live) return;
    // Normalise on the way in, so a lookup by a differently-cased wallet
    // cannot miss a person who is in fact enrolled.
    this.#byPerson.set(enrollment.personId.toLowerCase(), {
      ...enrollment,
      personId: enrollment.personId.toLowerCase() as Bytes32,
      address: enrollment.address.toLowerCase(),
    });
  }

  all(): Enrollment[] {
    return [...this.#byPerson.values()].sort((a, b) => a.enrolledAt - b.enrolledAt);
  }
}

export class SodError extends Error {
  readonly personId: Bytes32;
  readonly heldRoles: string[];

  constructor(personId: Bytes32, heldRoles: string[]) {
    super(
      `the same human already holds ${heldRoles.join(" and ")} on this purchase order ` +
        `- a different person has to do this`,
    );
    this.name = "SodError";
    this.personId = personId;
    this.heldRoles = heldRoles;
  }
}

/**
 * Checked in the backend before an attestation is ever signed, so the UI can
 * explain the refusal in words. The contract enforces the same rule
 * independently - this is the friendly copy, not the control.
 */
export function assertDistinct(
  candidate: Bytes32,
  held: Partial<Record<string, Bytes32 | null | undefined>>,
): void {
  const clashes = Object.entries(held)
    .filter(([, id]) => id && id.toLowerCase() === candidate.toLowerCase())
    .map(([role]) => role);

  if (clashes.length > 0) throw new SodError(candidate, clashes);
}
