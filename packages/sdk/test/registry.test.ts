import assert from "node:assert/strict";
import test from "node:test";

import { RegistryError, discoverEndpoints, registerEndpoint, toAtomic } from "../src/registry.ts";

const config = (fetchImpl: typeof fetch, apiKey?: string) => ({
  baseUrl: "https://pay.example.com/",
  ...(apiKey ? { apiKey } : {}),
  fetch: fetchImpl,
});

test("discovery is public and sends no key", async () => {
  let seen: { url: string; auth: string | null } | null = null;
  const f = (async (url: string, init: RequestInit) => {
    seen = { url, auth: new Headers(init.headers).get("authorization") };
    return new Response(JSON.stringify({ total: 0, endpoints: [] }), { status: 200 });
  }) as unknown as typeof fetch;

  await discoverEndpoints(config(f, "sk_live_secret"), { q: "weather", limit: 5 });
  assert.equal(seen!.url, "https://pay.example.com/api/registry/endpoints?q=weather&limit=5");
  assert.equal(seen!.auth, null, "a public read must not leak the key");
});

test("registering sends the key and the endpoint as given", async () => {
  let seen: { auth: string | null; body: Record<string, unknown> } | null = null;
  const f = (async (_u: string, init: RequestInit) => {
    seen = { auth: new Headers(init.headers).get("authorization"), body: JSON.parse(String(init.body)) as Record<string, unknown> };
    return new Response(JSON.stringify({ endpoint: { id: "ep_1", status: "verified" } }), { status: 201 });
  }) as unknown as typeof fetch;

  const ep = await registerEndpoint(config(f, "sk_live_abc"), {
    name: "Forecast",
    url: "https://api.example.com/forecast",
    payTo: "0.0.1234",
    amount: "10000",
  });
  assert.equal(ep.status, "verified");
  assert.equal(seen!.auth, "Bearer sk_live_abc");
  assert.equal(seen!.body["amount"], "10000");
});

test("a refusal surfaces with its status and the platform's words", async () => {
  const f = (async () => new Response(JSON.stringify({ error: "Invalid API key." }), { status: 401 })) as unknown as typeof fetch;
  await assert.rejects(
    registerEndpoint(config(f, "nope"), { name: "x", url: "https://a.example", payTo: "0.0.1", amount: "1" }),
    (e: unknown) => e instanceof RegistryError && e.status === 401 && /Invalid API key/.test(e.message),
  );
});

test("prices convert exactly, without a float", () => {
  assert.equal(toAtomic("0.0.0", "0.0001"), "10000");
  assert.equal(toAtomic("0.0.0", "1"), "100000000");
  assert.equal(toAtomic("0.0.429274", "0.01"), "10000");
  assert.equal(toAtomic("0.0.0", "0.1"), "10000000", "0.1 is exact here, though not in binary floating point");
});

test("a price with too many decimals is refused rather than rounded", () => {
  assert.throws(() => toAtomic("0.0.429274", "0.0000001"), /decimal places/);
  assert.throws(() => toAtomic("0.0.0", "abc"), /number/);
  assert.throws(() => toAtomic("0.0.99", "1"), /unknown asset/);
});
