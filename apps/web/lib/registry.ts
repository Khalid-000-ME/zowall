/**
 * The x402 endpoint registry.
 *
 * What a payments platform has to know about a seller before an agent pays them:
 * who they are, what they charge, where the money goes, and whether the endpoint
 * really answers the way it says it does. Vendors register endpoints; the
 * platform proves each one by calling it (see @zowall/x402/probe); buyers' agents
 * discover what is verified and spend against it.
 *
 * Only a vendor account can register or manage endpoints, and only its own.
 */

import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { keccak256, toHex } from "viem";
import { normaliseResource } from "@zowall/x402";

import { getAccount, type Account } from "@/lib/accounts";
import { probeEndpoint, type ProbeResult } from "@zowall/x402/probe";

/* ------------------------------------------------------------------- types -- */

export type EndpointStatus = "pending" | "verified" | "failing";

export type Endpoint = {
  id: string;
  /** the vendor account that owns it */
  merchantId: string;
  name: string;
  description: string;
  /** the resource URL, normalised, exactly as the endpoint quotes it */
  url: string;
  network: string;
  /** "0.0.0" is HBAR on Hedera */
  asset: string;
  payTo: string;
  /** price per call, atomic units of the asset, as a decimal string */
  amount: string;
  tags: string[];
  visibility: "public" | "private";
  status: EndpointStatus;
  /** keccak256 of the normalised URL. A mandate for this endpoint is an order with this spec. */
  specHash: `0x${string}`;
  verification: ProbeResult | null;
  createdAt: number;
  updatedAt: number;
};

type Db = { endpoints: Record<string, Endpoint> };

/* ------------------------------------------------------------------- store -- */

const FILE = resolve(process.cwd(), ".data/registry.json");

function load(): Db {
  try {
    const d = JSON.parse(readFileSync(FILE, "utf8")) as Partial<Db>;
    return { endpoints: d.endpoints ?? {} };
  } catch {
    return { endpoints: {} };
  }
}

function save(db: Db): void {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(db, null, 2));
}

const rid = (prefix: string) => `${prefix}_${randomBytes(12).toString("hex")}`;

/* ------------------------------------------------------------------ endpoints -- */

export class RegistryError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type EndpointInput = {
  name: string;
  description?: string;
  url: string;
  network?: string;
  asset?: string;
  payTo: string;
  amount: string;
  tags?: string[];
  visibility?: "public" | "private";
};

const HEDERA_ACCOUNT = /^\d+\.\d+\.\d+$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

/** Reject anything that cannot be a payable, describable endpoint before it is probed. */
export function normaliseInput(i: EndpointInput) {
  const name = (i.name ?? "").trim().slice(0, 80);
  if (name.length < 2) throw new RegistryError("An endpoint needs a name.");

  let url: string;
  try {
    const u = new URL(i.url);
    if (u.hash) u.hash = "";
    url = normaliseResource(u.toString());
  } catch {
    throw new RegistryError("The URL is not valid.");
  }

  const network = (i.network ?? "hedera:testnet").trim();
  if (!/^[a-z0-9-]+:[a-zA-Z0-9-]+$/.test(network)) {
    throw new RegistryError('The network must be a CAIP-2 identifier such as "hedera:testnet".');
  }

  const asset = (i.asset ?? "0.0.0").trim();
  const payTo = (i.payTo ?? "").trim();
  if (!(HEDERA_ACCOUNT.test(payTo) || EVM_ADDRESS.test(payTo))) {
    throw new RegistryError("The payee must be a Hedera account id (0.0.x) or an EVM address.");
  }
  if (network.startsWith("hedera:") && !HEDERA_ACCOUNT.test(payTo)) {
    throw new RegistryError("On Hedera the payee must be an account id such as 0.0.1234.");
  }

  if (!/^\d{1,30}$/.test(String(i.amount)) || BigInt(i.amount) === 0n) {
    throw new RegistryError("The price must be a whole number of atomic units, above zero.");
  }

  const tags = [...new Set((i.tags ?? []).map((t) => t.trim().toLowerCase()).filter((t) => /^[a-z0-9-]{1,24}$/.test(t)))].slice(0, 6);

  return {
    name,
    description: (i.description ?? "").trim().slice(0, 280),
    url,
    network,
    asset,
    payTo,
    amount: String(i.amount),
    tags,
    visibility: i.visibility === "private" ? ("private" as const) : ("public" as const),
  };
}

const statusOf = (r: ProbeResult): EndpointStatus => (r.ok ? "verified" : "failing");

/**
 * Register an endpoint. It is stored either way, and marked verified only if its
 * own 402 agrees with the registration, so a merchant sees exactly what to fix.
 */
export async function registerEndpoint(merchantId: string, input: EndpointInput): Promise<Endpoint> {
  const owner = getAccount(merchantId);
  if (!owner || owner.role !== "vendor") throw new RegistryError("Only a vendor account can register endpoints.", 403);

  const v = normaliseInput(input);
  const db = load();
  if (Object.values(db.endpoints).some((e) => e.url === v.url && e.network === v.network)) {
    throw new RegistryError("That endpoint is already registered.", 409);
  }

  const probe = await probeEndpoint(v);
  const now = Date.now();
  const endpoint: Endpoint = {
    id: rid("ep"),
    merchantId,
    ...v,
    status: statusOf(probe),
    specHash: keccak256(toHex(v.url)),
    verification: probe,
    createdAt: now,
    updatedAt: now,
  };

  const fresh = load();
  fresh.endpoints[endpoint.id] = endpoint;
  save(fresh);
  return endpoint;
}

export const getEndpoint = (id: string): Endpoint | null => load().endpoints[id] ?? null;

/** Can this caller see this endpoint? Private and unverified ones belong to their vendor. */
export function visibleTo(e: Endpoint, caller: Account | null): boolean {
  if (caller && caller.id === e.merchantId) return true;
  return e.visibility === "public" && e.status === "verified";
}

export type Listing = {
  q?: string;
  tag?: string;
  network?: string;
  asset?: string;
  merchantId?: string;
  /** include everything the caller owns, not just the public verified catalogue */
  caller?: Account | null;
  limit?: number;
  offset?: number;
};

export function listEndpoints(f: Listing = {}): { items: Endpoint[]; total: number } {
  const q = f.q?.trim().toLowerCase();
  const all = Object.values(load().endpoints)
    .filter((e) => visibleTo(e, f.caller ?? null))
    .filter((e) => !f.merchantId || e.merchantId === f.merchantId)
    .filter((e) => !f.tag || e.tags.includes(f.tag.toLowerCase()))
    .filter((e) => !f.network || e.network === f.network)
    .filter((e) => !f.asset || e.asset === f.asset)
    .filter(
      (e) =>
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.url.toLowerCase().includes(q) ||
        e.tags.some((t) => t.includes(q)),
    )
    .sort((a, b) => b.createdAt - a.createdAt);

  const offset = Math.max(0, f.offset ?? 0);
  const limit = Math.min(100, Math.max(1, f.limit ?? 24));
  return { items: all.slice(offset, offset + limit), total: all.length };
}

export type EndpointPatch = Partial<Pick<EndpointInput, "name" | "description" | "tags" | "visibility">> & {
  amount?: string;
};

/** Changing the price changes what must be true of the endpoint, so it is probed again. */
export async function updateEndpoint(id: string, patch: EndpointPatch): Promise<Endpoint> {
  const current = getEndpoint(id);
  if (!current) throw new RegistryError("No such endpoint.", 404);

  const merged = normaliseInput({
    name: patch.name ?? current.name,
    description: patch.description ?? current.description,
    url: current.url,
    network: current.network,
    asset: current.asset,
    payTo: current.payTo,
    amount: patch.amount ?? current.amount,
    tags: patch.tags ?? current.tags,
    visibility: patch.visibility ?? current.visibility,
  });

  const priceChanged = merged.amount !== current.amount;
  const probe = priceChanged ? await probeEndpoint(merged) : current.verification;

  const next: Endpoint = {
    ...current,
    ...merged,
    status: probe ? statusOf(probe) : "pending",
    verification: probe,
    updatedAt: Date.now(),
  };
  const db = load();
  db.endpoints[id] = next;
  save(db);
  return next;
}

/** Call the endpoint again and record what it said. */
export async function reverify(id: string): Promise<Endpoint> {
  const current = getEndpoint(id);
  if (!current) throw new RegistryError("No such endpoint.", 404);

  const probe = await probeEndpoint(current);
  const next: Endpoint = { ...current, status: statusOf(probe), verification: probe, updatedAt: Date.now() };
  const db = load();
  db.endpoints[id] = next;
  save(db);
  return next;
}

export function removeEndpoint(id: string): void {
  const db = load();
  if (!db.endpoints[id]) throw new RegistryError("No such endpoint.", 404);
  delete db.endpoints[id];
  save(db);
}

/** Can this caller change this endpoint? Only the vendor that owns it. */
export function canManage(e: Endpoint, caller: Account | null): boolean {
  return caller !== null && caller.id === e.merchantId;
}

/** Everything a vendor has registered, in any state, so it can see what failed and why. */
export function endpointsOf(accountId: string): Endpoint[] {
  return Object.values(load().endpoints)
    .filter((e) => e.merchantId === accountId)
    .sort((a, b) => b.createdAt - a.createdAt);
}
