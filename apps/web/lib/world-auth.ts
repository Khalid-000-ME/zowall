/**
 * World ID sign-in, server side.
 *
 * Sign-in uses its own World action, WORLD_LOGIN_ACTION, set up in the Developer
 * Portal to allow unlimited verifications per person. That is what makes it usable
 * for signing in: an action that allows one verification per person gives the same
 * human a different answer the second time (`nullifier_replayed`), which is right for
 * enrolment and wrong for logging in again.
 *
 * When no login action is set it falls back to the enrolment action. Signing up works,
 * and signing in a second time does not, and the pages say so.
 */

import { createNonceStore, type NonceStore } from "@zowall/world";

const g = globalThis as unknown as { __zowallAuthNonces?: NonceStore };
/** A global, because in dev each route can load its own copy of this module. */
export const authNonces: NonceStore = (g.__zowallAuthNonces ??= createNonceStore({ ttlMs: 10 * 60_000 }));

export function loginAction(): { action: string | undefined; repeatable: boolean } {
  const login = process.env["WORLD_LOGIN_ACTION"];
  const enrol = process.env["WORLD_ACTION"];
  if (login) return { action: login, repeatable: login !== enrol };
  return { action: enrol, repeatable: false };
}
