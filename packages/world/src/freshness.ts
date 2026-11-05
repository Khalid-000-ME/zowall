/**
 * Freshness: proof that a human is present *now*, as opposed to identity,
 * which comes from the enrollment registry.
 *
 * Two modes, and the fallback is the interesting part.
 *
 * `session` uses session proofs - createSession / proveSession with
 * IDKitSessionWidget and a stored session_id. These sign without an action,
 * which is exactly why they are repeatable: there is no per-action nullifier
 * to replay. This is the mode we want.
 *
 * `per-role` registers three separate actions and takes freshness from a
 * per-role uniqueness proof. It works because personId never comes from the
 * per-event proof - identity is always the enrollment nullifier. The cost is
 * repeatability: one proof per human per role for the whole event. Survivable
 * with three or four test identities, which is what a demo has.
 *
 * Session proofs are named in swish's own comments but were never implemented
 * there, so this is the one genuinely new World surface in the build. Confirm
 * createSession / proveSession and IDKitSessionWidget before relying on them.
 */

import type { Role } from "./roles.ts";

export type FreshnessMode = "session" | "per-role";

/** Fallback action ids, used only in `per-role` mode. */
export const ROLE_ACTIONS: Readonly<Record<Role, string>> = Object.freeze({
  Creator: "zowall-create",
  Receiver: "zowall-receipt",
  Approver: "zowall-approve",
});

/** How long a freshness check is good for before the act must be re-proven. */
export const FRESHNESS_TTL_SECONDS = 600;

export type FreshnessCheck = {
  mode: FreshnessMode;
  role: Role;
  /** unix seconds */
  verifiedAt: number;
  expiresAt: number;
};

export function isFresh(check: FreshnessCheck, now = Math.floor(Date.now() / 1000)): boolean {
  return now <= check.expiresAt;
}

export function newCheck(
  role: Role,
  mode: FreshnessMode,
  now = Math.floor(Date.now() / 1000),
): FreshnessCheck {
  return { mode, role, verifiedAt: now, expiresAt: now + FRESHNESS_TTL_SECONDS };
}

/**
 * Which mode to run. Reads configuration rather than feature-detecting, so a
 * demo cannot silently drop to the weaker mode without someone deciding to.
 */
export function configuredMode(env: Record<string, string | undefined> = process.env): FreshnessMode {
  return env["WORLD_FRESHNESS_MODE"] === "per-role" ? "per-role" : "session";
}

/** The action to request for a role under the current mode. */
export function actionFor(role: Role, mode: FreshnessMode): string | null {
  // Session proofs sign without an action. Sending `action: ""` alongside a
  // signature made without one produces `invalid_rp_signature`: World sees an
  // action on the request and recomputes the 81-byte message, which can never
  // match a 49-byte signature. A blank action is a contradiction, not a mode.
  return mode === "session" ? null : ROLE_ACTIONS[role];
}
