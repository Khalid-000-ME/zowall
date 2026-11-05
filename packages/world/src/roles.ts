/**
 * The three roles, and the rule that makes the whole control work.
 *
 * In a real accounts-payable department the person who raises the order, the
 * person who signs for the delivery and the person who waves through an
 * exception are three different people. That is not bureaucracy for its own
 * sake - it is the only reason a receipt means anything, because otherwise the
 * buyer is just attesting to itself.
 *
 * Role numbers must match `enum Role` in ZowallGate.sol.
 */

export const ROLES = ["Creator", "Receiver", "Approver"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_CODE: Readonly<Record<Role, number>> = Object.freeze({
  Creator: 0,
  Receiver: 1,
  Approver: 2,
});

export const ROLE_LABEL: Readonly<Record<Role, string>> = Object.freeze({
  Creator: "Raises purchase orders",
  Receiver: "Signs for deliveries",
  Approver: "Releases held invoices",
});

export function roleFromCode(code: number): Role {
  const role = ROLES[code];
  if (!role) throw new Error(`unknown role code: ${code}`);
  return role;
}
