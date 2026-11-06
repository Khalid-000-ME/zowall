/**
 * The three people the control separates.
 *
 * Every purchase order has a creator, a receiver and an approver, and they must
 * be three different humans. A "human" here is an enrollment personId: the
 * World ID nullifier from the single `zowall-enroll` action, which is stable
 * per person and therefore comparable across roles.
 *
 * Stand-ins are fixed personIds for rehearsing the flow before anyone has
 * enrolled, and they are labelled as such wherever they appear. A person who
 * enrolls through World ID is listed alongside them.
 */

import type { Bytes32 } from "@zowall/gate-core";

import { enrollments } from "@/lib/store";

export type Human = {
  key: string;
  name: string;
  personId: Bytes32;
  /** true when this person came from a verified World ID proof */
  enrolled: boolean;
};

const pid = (hex: string): Bytes32 => `0x${hex.repeat(32)}` as Bytes32;

export const STAND_INS: readonly Human[] = [
  { key: "alice", name: "Alice", personId: pid("a1"), enrolled: false },
  { key: "bob", name: "Bob", personId: pid("b2"), enrolled: false },
  { key: "cara", name: "Cara", personId: pid("c3"), enrolled: false },
];

export function humans(): Human[] {
  const live: Human[] = enrollments.all().map((e) => ({
    key: e.personId,
    name: e.label,
    personId: e.personId,
    enrolled: true,
  }));
  return [...STAND_INS, ...live];
}

export function humanByKey(key: string): Human | undefined {
  return humans().find((h) => h.key === key);
}

export function nameOf(personId: string): string {
  const found = humans().find((h) => h.personId.toLowerCase() === personId.toLowerCase());
  return found ? found.name : `${personId.slice(0, 8)}…`;
}
