/**
 * The registry, from code.
 *
 * Vendors register the x402 endpoints they sell, and the platform proves each one
 * by calling it. Buyers' agents discover what is verified. Both go through the
 * same few calls.
 *
 *   // a vendor, on its own server
 *   const ep = await registerEndpoint(
 *     { baseUrl, apiKey },
 *     { name: "Forecast", url: "https://api.example.com/forecast", payTo: "0.0.1234", amount: "10000" },
 *   );
 *   if (ep.status !== "verified") console.log(ep.verification?.reasons);
 *
 *   // a buyer's agent
 *   const { endpoints } = await discoverEndpoints({ baseUrl }, { q: "weather" });
 */

export type RegistryConfig = {
  /** where the platform is served, e.g. https://pay.example.com */
  baseUrl: string;
  /** your API key. Needed to register and manage endpoints; discovery is public. */
  apiKey?: string;
  fetch?: typeof fetch;
};

export type EndpointStatus = "pending" | "verified" | "failing";

export type RegisteredEndpoint = {
  id: string;
  name: string;
  description: string;
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
  /** keccak256 of the normalised URL: a mandate for this endpoint is an order with this spec */
  specHash: `0x${string}`;
  merchant: { id: string; name: string };
  verification: {
    ok: boolean;
    /** why it failed, one plain sentence each. Empty when it passed. */
    reasons: string[];
    checkedAt: number;
    x402Version: number | null;
    feePayer: string | null;
  } | null;
  createdAt: number;
  updatedAt: number;
};

export type NewEndpoint = {
  name: string;
  url: string;
  /** the account the endpoint's own 402 quote pays */
  payTo: string;
  /** price per call in atomic units of the asset, e.g. "10000" tinybars */
  amount: string;
  description?: string;
  /** defaults to hedera:testnet */
  network?: string;
  /** defaults to "0.0.0" (HBAR) */
  asset?: string;
  tags?: string[];
  /** private endpoints are visible only to you */
  visibility?: "public" | "private";
};

export type Discovery = {
  q?: string;
  tag?: string;
  network?: string;
  asset?: string;
  limit?: number;
  offset?: number;
};

export class RegistryError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "RegistryError";
    this.status = status;
  }
}

async function call<T>(
  config: RegistryConfig,
  path: string,
  init: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  const doFetch = config.fetch ?? fetch;
  const headers: Record<string, string> = { accept: "application/json" };
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (config.apiKey && init.auth !== false) headers["authorization"] = `Bearer ${config.apiKey}`;

  const res = await doFetch(`${config.baseUrl.replace(/\/$/, "")}${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new RegistryError(body.error ?? `the platform answered ${res.status}`, res.status);
  return body;
}

/** Find endpoints that are verified and public. No key needed. */
export async function discoverEndpoints(
  config: RegistryConfig,
  filter: Discovery = {},
): Promise<{ total: number; endpoints: RegisteredEndpoint[] }> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const suffix = qs.size > 0 ? `?${qs}` : "";
  return call(config, `/api/registry/endpoints${suffix}`, { auth: false });
}

/** Everything you have registered, in any state. Needs your key. */
export async function myEndpoints(config: RegistryConfig): Promise<{ total: number; endpoints: RegisteredEndpoint[] }> {
  return call(config, "/api/registry/endpoints?mine=1");
}

export async function getEndpoint(config: RegistryConfig, id: string): Promise<RegisteredEndpoint> {
  return (await call<{ endpoint: RegisteredEndpoint }>(config, `/api/registry/endpoints/${id}`)).endpoint;
}

/**
 * Register an endpoint. The platform calls it with no payment and checks that its
 * own 402 names the payee and price you give here. It is saved either way: read
 * `status` and `verification.reasons` to see what to fix.
 */
export async function registerEndpoint(config: RegistryConfig, input: NewEndpoint): Promise<RegisteredEndpoint> {
  return (await call<{ endpoint: RegisteredEndpoint }>(config, "/api/registry/endpoints", { method: "POST", body: input })).endpoint;
}

/** Call the endpoint again and record what it said. */
export async function verifyEndpoint(config: RegistryConfig, id: string): Promise<RegisteredEndpoint> {
  return (await call<{ endpoint: RegisteredEndpoint }>(config, `/api/registry/endpoints/${id}/verify`, { method: "POST" })).endpoint;
}

export async function removeEndpoint(config: RegistryConfig, id: string): Promise<void> {
  await call(config, `/api/registry/endpoints/${id}`, { method: "DELETE" });
}

const DECIMALS: Record<string, number> = { "0.0.0": 8, "0.0.429274": 6 };

/** "0.0001" HBAR -> "10000" tinybars. Exact: it never goes through a float. */
export function toAtomic(asset: string, human: string): string {
  const decimals = DECIMALS[asset];
  if (decimals === undefined) throw new Error(`unknown asset ${asset}: pass the amount in atomic units instead`);
  const m = /^(\d{1,18})(?:\.(\d{1,18}))?$/.exec(human.trim());
  if (!m) throw new Error("the price must be a number such as 0.0001");
  const frac = (m[2] ?? "").padEnd(decimals, "0");
  if (frac.length > decimals) throw new Error(`that asset has ${decimals} decimal places at most`);
  return BigInt(m[1]! + frac).toString();
}
