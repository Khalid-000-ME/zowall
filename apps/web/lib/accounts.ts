/**
 * Accounts, API keys and sessions.
 *
 * Two kinds of account, and nothing else to tell apart:
 *
 *   a vendor sells: it registers x402 endpoints and may create checkout sessions;
 *   a buyer spends: its agents discover endpoints and pay for them.
 *
 * Both sign up and sign in with World ID, and both get API keys for the SDK. The
 * account is bound to the person's World ID for this app, so one human is one account
 * and there is no password to leak, reuse or phish. A key is shown once, when it is
 * created, and only its hash is kept, so a leaked data file leaks no working key.
 *
 * Accounts made before World sign-in carry an email and a salted scrypt password
 * hash. They can still sign in that way only when ALLOW_PASSWORD_LOGIN=true.
 *
 * This is deliberately small: it is the identity a platform like this needs to put
 * a name against an endpoint and a key against a caller, not a user-management
 * system.
 */

import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type Role = "vendor" | "buyer";

export type Account = {
  id: string;
  role: Role;
  name: string;
  /**
   * The person's World ID for this app: a stable pseudonym from a World ID proof,
   * the same every time the same human signs in. Unique across accounts.
   */
  worldId?: string;
  /** legacy accounts only */
  email?: string;
  /** legacy accounts only. scrypt$<salt hex>$<hash hex> */
  passwordHash?: string;
  createdAt: number;
};

export type ApiKey = {
  id: string;
  accountId: string;
  name: string;
  /** the first characters of the key, so people can tell their keys apart */
  prefix: string;
  /** sha256 of the key. The key itself is never stored. */
  hash: string;
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
};

type Session = { tokenHash: string; accountId: string; expiresAt: number };

type Db = {
  accounts: Record<string, Account>;
  keys: Record<string, ApiKey>;
  sessions: Record<string, Session>;
};

export class AccountError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/* ------------------------------------------------------------------- store -- */

const FILE = resolve(process.cwd(), ".data/accounts.json");

function load(): Db {
  try {
    const d = JSON.parse(readFileSync(FILE, "utf8")) as Partial<Db>;
    return { accounts: d.accounts ?? {}, keys: d.keys ?? {}, sessions: d.sessions ?? {} };
  } catch {
    return { accounts: {}, keys: {}, sessions: {} };
  }
}

function save(db: Db): void {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(db, null, 2));
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const rid = (prefix: string) => `${prefix}_${randomBytes(10).toString("hex")}`;

/* ---------------------------------------------------------------- passwords -- */

// Only for accounts made before World sign-in. New accounts have no password.

function checkPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/* ------------------------------------------------------------------- sign up -- */

export type NewAccount = { role: Role; name: string };

export function validateNewAccount(i: Partial<NewAccount>): NewAccount {
  const role = i.role === "buyer" ? "buyer" : i.role === "vendor" ? "vendor" : null;
  if (!role) throw new AccountError("Choose whether you are selling or buying.");
  const name = (i.name ?? "").trim().slice(0, 60);
  if (name.length < 2) throw new AccountError("Enter a name.");
  return { role, name };
}

const normWorldId = (id: string) => id.trim().toLowerCase();

export function accountByWorldId(worldId: string): Account | null {
  const id = normWorldId(worldId);
  return Object.values(load().accounts).find((a) => a.worldId === id) ?? null;
}

/**
 * Create an account for a verified human, with its first API key. The key is returned
 * once and never again. A person who already has an account cannot make a second one.
 */
export function createWorldAccount(
  input: NewAccount & { worldId: string },
): { account: Account; apiKey: string; token: string } {
  const worldId = normWorldId(input.worldId);
  if (!worldId) throw new AccountError("No World ID to create an account for.");

  const db = load();
  if (Object.values(db.accounts).some((a) => a.worldId === worldId)) {
    throw new AccountError("This person already has an account. Sign in instead.", 409);
  }

  const account: Account = {
    id: rid("acc"),
    role: input.role,
    name: input.name,
    worldId,
    createdAt: Date.now(),
  };
  db.accounts[account.id] = account;
  save(db);

  const { apiKey } = createKey(account.id, "Default");
  const token = startSession(account.id);
  return { account, apiKey, token };
}

/** Legacy accounts only, and only when the operator has allowed it. */
export function verifyLogin(email: string, password: string): Account {
  const account = Object.values(load().accounts).find(
    (a) => a.email && a.passwordHash && a.email === email.trim().toLowerCase(),
  );
  // The same message for an unknown email and a wrong password, and the hash is
  // computed either way, so neither the text nor the timing says which it was.
  const ok = account?.passwordHash
    ? checkPassword(password, account.passwordHash)
    : (checkPassword(password, "scrypt$00$00"), false);
  if (!account || !ok) throw new AccountError("That email and password do not match.", 401);
  return account;
}

export const getAccount = (id: string): Account | null => load().accounts[id] ?? null;

/* ---------------------------------------------------------------------- keys -- */

export function createKey(accountId: string, name: string): { key: ApiKey; apiKey: string } {
  const db = load();
  const account = db.accounts[accountId];
  if (!account) throw new AccountError("No such account.", 404);

  const live = Object.values(db.keys).filter((k) => k.accountId === accountId && !k.revokedAt);
  if (live.length >= 10) throw new AccountError("An account can hold at most 10 active keys. Revoke one first.");

  const apiKey = `sk_live_${randomBytes(24).toString("hex")}`;
  const key: ApiKey = {
    id: rid("key"),
    accountId,
    name: name.trim().slice(0, 40) || "Untitled key",
    prefix: apiKey.slice(0, 12),
    hash: sha256(apiKey),
    createdAt: Date.now(),
  };
  db.keys[key.id] = key;
  save(db);
  return { key, apiKey };
}

export const listKeys = (accountId: string): ApiKey[] =>
  Object.values(load().keys)
    .filter((k) => k.accountId === accountId)
    .sort((a, b) => b.createdAt - a.createdAt);

export function revokeKey(accountId: string, keyId: string): void {
  const db = load();
  const key = db.keys[keyId];
  if (!key || key.accountId !== accountId) throw new AccountError("No such key.", 404);
  if (!key.revokedAt) {
    key.revokedAt = Date.now();
    save(db);
  }
}

/** Who is calling, by API key. Revoked keys do not authenticate. */
export function authenticate(request: Request): Account | null {
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!given) return null;

  const db = load();
  const hash = sha256(given);
  const key = Object.values(db.keys).find((k) => !k.revokedAt && k.hash === hash);
  if (!key) return null;

  const account = db.accounts[key.accountId];
  if (!account) return null;

  // Recording use is for the owner's benefit, so a write that fails never fails the call.
  try {
    if (!key.lastUsedAt || Date.now() - key.lastUsedAt > 60_000) {
      key.lastUsedAt = Date.now();
      save(db);
    }
  } catch {
    // ignored
  }
  return account;
}

/* ------------------------------------------------------------------ sessions -- */

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE = "zw_session";

export function startSession(accountId: string): string {
  const token = randomBytes(32).toString("hex");
  const db = load();
  // Expired sessions are swept as new ones are made, so the file does not grow forever.
  for (const [k, s] of Object.entries(db.sessions)) if (s.expiresAt < Date.now()) delete db.sessions[k];
  db.sessions[sha256(token)] = { tokenHash: sha256(token), accountId, expiresAt: Date.now() + SESSION_MS };
  save(db);
  return token;
}

export function accountForSession(token: string | undefined): Account | null {
  if (!token) return null;
  const db = load();
  const s = db.sessions[sha256(token)];
  if (!s || s.expiresAt < Date.now()) return null;
  return db.accounts[s.accountId] ?? null;
}

export function endSession(token: string | undefined): void {
  if (!token) return;
  const db = load();
  delete db.sessions[sha256(token)];
  save(db);
}

export const SESSION_MAX_AGE_S = SESSION_MS / 1000;
