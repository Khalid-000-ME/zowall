/**
 * The three people the control separates.
 *
 * Every purchase order has a creator, a receiver and an approver, and they must
 * be three different humans. A "human" here is an enrollment personId: the
 * World ID nullifier from the single `zowall-enroll` action, which is stable
 * per person and therefore comparable across roles.
 *
 * Only people who have verified with World ID exist here. There are no
 * placeholder identities: an id the app invented would be an id World never
 * vouched for, and showing it next to real ones is how a demo ends up claiming
 * more than it proved.
 */

import type { Bytes32 } from "@zowall/gate-core";

import { enrollments } from "@/lib/store";

export type Human = {
  key: string;
  name: string;
  personId: Bytes32;
  /** always true: nobody is listed unless a World ID proof was verified for them */
  enrolled: true;
};

/**
 * Not a person. It stands for "someone who has not verified with World ID", so
 * the denied path can be shown without inventing an identity: there is nothing to
 * attest, so the attestor refuses before a transaction exists.
 */
export const UNVERIFIED_KEY = "unverified";

export function humans(): Human[] {
  return enrollments().all().map((e) => ({
    key: e.personId,
    name: e.label,
    personId: e.personId,
    enrolled: true as const,
  }));
}

export function humanByKey(key: string): Human | undefined {
  return humans().find((h) => h.key === key);
}

export function nameOf(personId: string): string {
  const found = humans().find((h) => h.personId.toLowerCase() === personId.toLowerCase());
  return found ? found.name : `${personId.slice(0, 8)}…`;
}
