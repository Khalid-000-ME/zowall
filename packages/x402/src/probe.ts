/**
 * Proving an endpoint is what its registrant says it is.
 *
 * Anyone can type a URL and a payee into a form. What a registry must not do is
 * believe it. So registration is conditional on the endpoint's own answer: the
 * platform calls it with no payment and requires a 402 whose quote names the same
 * account, the same price, the same network and the same resource as the
 * registration. That is also the ownership check. Register someone else's URL
 * against your own account and their 402 will name theirs, so it fails.
 *
 * Fetching a URL a stranger supplied is a classic way to be turned against your
 * own network. Every call here resolves the host first and refuses anything that
 * is not a public address, does not follow redirects, is bounded in time and in
 * size, and only ever sends a plain GET.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { normaliseResource, parsePaymentRequired } from "./quote.ts";

export type ProbeExpectation = {
  url: string;
  network: string;
  asset: string;
  payTo: string;
  /** atomic units, as a decimal string */
  amount: string;
};

export type ProbeQuote = {
  network: string;
  asset: string;
  payTo: string;
  amount: string;
  resource: string;
  feePayer: string | null;
  version: number;
};

export type ProbeResult = {
  ok: boolean;
  /** why it failed, one plain sentence each. Empty when ok. */
  reasons: string[];
  quote: ProbeQuote | null;
  /** what the endpoint answered, when it answered */
  httpStatus: number | null;
  checkedAt: number;
};

const MAX_BODY = 64 * 1024;
const TIMEOUT_MS = 8_000;

/* ------------------------------------------------------------- address guard -- */

function ipv4Blocked(ip: string): boolean {
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, including cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function ipv6Blocked(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::1" || v === "::") return true;
  if (v.startsWith("fe80:") || v.startsWith("fc") || v.startsWith("fd")) return true;
  // an IPv4 address carried inside IPv6
  const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  return mapped?.[1] ? ipv4Blocked(mapped[1]) : false;
}

export const isBlockedAddress = (ip: string): boolean =>
  isIP(ip) === 4 ? ipv4Blocked(ip) : isIP(ip) === 6 ? ipv6Blocked(ip) : true;

/**
 * Local addresses are refused unless the operator asks for them. A developer
 * registering `localhost` against a dev server is legitimate; a production
 * platform fetching `localhost` on behalf of a stranger is not.
 */
const allowLocal = () => process.env["REGISTRY_ALLOW_LOCAL"] === "true";

async function assertPublicHost(url: URL): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("only http and https URLs can be registered");
  if (url.username || url.password) throw new Error("a URL with credentials in it cannot be registered");

  if (allowLocal()) return;
  if (url.protocol !== "https:") throw new Error("a public endpoint must be served over https");

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.length === 0) throw new Error("that host does not resolve");
  for (const a of addresses) {
    if (isBlockedAddress(a.address)) throw new Error("that host resolves to a private address");
  }
}

/* ---------------------------------------------------------------------- probe -- */

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BODY) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => undefined);
  return Buffer.concat(chunks).toString("utf8").slice(0, MAX_BODY);
}

const fail = (reasons: string[], httpStatus: number | null = null, quote: ProbeQuote | null = null): ProbeResult => ({
  ok: false,
  reasons,
  quote,
  httpStatus,
  checkedAt: Date.now(),
});

export async function probeEndpoint(expected: ProbeExpectation): Promise<ProbeResult> {
  let url: URL;
  try {
    url = new URL(expected.url);
    await assertPublicHost(url);
  } catch (err) {
    return fail([err instanceof Error ? err.message : "that URL cannot be registered"]);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      headers: { accept: "application/json", "user-agent": "ZowallRegistry/1" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    return fail(["the endpoint did not answer within 8 seconds"]);
  }

  if (res.status >= 300 && res.status < 400) {
    return fail(["the endpoint redirected. Register the final URL, which must answer 402 directly"], res.status);
  }
  if (res.status !== 402) {
    return fail([`the endpoint answered ${res.status}. A paid endpoint must answer 402 Payment Required without a payment`], res.status);
  }

  let body: unknown = null;
  try {
    body = JSON.parse(await readCapped(res));
  } catch {
    // v2 servers may carry the whole quote in a header and a body that is not JSON.
  }

  const quote = parsePaymentRequired(body, res.headers);
  if (!quote) return fail(["the 402 did not carry an x402 quote the registry can read"], 402);

  // Pick the quote that corresponds to what was registered.
  const wanted = quote.accepts.find((a) => a.network === expected.network && a.scheme === "exact");
  if (!wanted) {
    return fail(
      [`none of the offered payment options is the "exact" scheme on ${expected.network}`],
      402,
    );
  }

  const feePayer = typeof wanted.extra?.["feePayer"] === "string" ? wanted.extra["feePayer"] : null;
  const seen: ProbeQuote = {
    network: wanted.network,
    asset: wanted.asset,
    payTo: wanted.payTo,
    amount: wanted.amount,
    resource: wanted.resource,
    feePayer,
    version: quote.x402Version,
  };

  // EVM addresses are the same account in any letter case; Hedera ids have no case.
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

  const reasons: string[] = [];
  if (!same(wanted.payTo, expected.payTo)) {
    reasons.push(`the endpoint's own quote pays ${wanted.payTo}, not ${expected.payTo}. You can only register an endpoint that pays an account you name`);
  }
  if (wanted.amount !== expected.amount) {
    reasons.push(`the endpoint quotes ${wanted.amount}, not ${expected.amount}`);
  }
  if (!same(wanted.asset || "0.0.0", expected.asset || "0.0.0")) {
    reasons.push(`the endpoint is priced in ${wanted.asset}, not ${expected.asset}`);
  }
  if (wanted.resource && normaliseResource(wanted.resource) !== normaliseResource(expected.url)) {
    reasons.push(`the quote names a different resource (${wanted.resource})`);
  }

  return { ok: reasons.length === 0, reasons, quote: seen, httpStatus: 402, checkedAt: Date.now() };
}
