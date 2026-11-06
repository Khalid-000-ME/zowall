/**
 * The registry calls URLs strangers type into a form, so what matters most is
 * what it refuses to call, and what it refuses to believe.
 *
 * These tests run a real HTTP server on loopback and set REGISTRY_ALLOW_LOCAL, the
 * only way a test can reach one, so the guard is exercised separately by asking it
 * about addresses directly and by running the probe with the allowance off.
 */

import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { isBlockedAddress, probeEndpoint } from "../src/probe.ts";
import { encodeHeader } from "../src/types.ts";

const PAYEE = "0.0.2002";

function serve(handler: (req: { url: string }) => { status: number; headers?: Record<string, string>; body?: unknown }): Promise<{
  server: Server;
  base: string;
}> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const out = handler({ url: req.url ?? "/" });
      res.writeHead(out.status, { "content-type": "application/json", ...out.headers });
      res.end(out.body === undefined ? "" : JSON.stringify(out.body));
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }));
  });
}

const v2 = (base: string, over: Record<string, unknown> = {}) => {
  const quote = {
    x402Version: 2,
    error: "payment required",
    resource: { url: `${base}/forecast`, description: "forecast" },
    accepts: [
      { scheme: "exact", network: "hedera:testnet", amount: "10000", asset: "0.0.0", payTo: PAYEE, maxTimeoutSeconds: 60, extra: { feePayer: "0.0.9185802" }, ...over },
    ],
  };
  return { status: 402, headers: { "payment-required": encodeHeader(quote) }, body: quote };
};

const expected = (base: string, over: Record<string, string> = {}) => ({
  url: `${base}/forecast`,
  network: "hedera:testnet",
  asset: "0.0.0",
  payTo: PAYEE,
  amount: "10000",
  ...over,
});

test.beforeEach(() => {
  process.env["REGISTRY_ALLOW_LOCAL"] = "true";
});
test.afterEach(() => {
  delete process.env["REGISTRY_ALLOW_LOCAL"];
});

/* ----------------------------------------------------------- believing it -- */

test("an endpoint whose own 402 matches the registration verifies", async () => {
  const { server, base } = await serve(() => v2(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
  const r = await probeEndpoint(expected(base));
  server.close();
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.equal(r.quote?.feePayer, "0.0.9185802");
  assert.equal(r.quote?.version, 2);
});

test("registering someone else's URL against your own account fails, because their 402 names theirs", async () => {
  const { server, base } = await serve(() => v2(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
  const r = await probeEndpoint(expected(base, { payTo: "0.0.6666" }));
  server.close();
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes("0.0.6666") && x.includes("0.0.2002")), r.reasons.join("; "));
});

test("a price that differs from the registration fails", async () => {
  const { server, base } = await serve(() => v2(`http://127.0.0.1:${(server.address() as AddressInfo).port}`));
  const r = await probeEndpoint(expected(base, { amount: "5" }));
  server.close();
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes("10000")));
});

test("an endpoint that does not answer 402 is not a paid endpoint", async () => {
  const { server, base } = await serve(() => ({ status: 200, body: { free: true } }));
  const r = await probeEndpoint(expected(base));
  server.close();
  assert.equal(r.ok, false);
  assert.match(r.reasons[0] ?? "", /answered 200/);
});

test("a 402 that is not an x402 quote is not accepted", async () => {
  const { server, base } = await serve(() => ({ status: 402, body: { pay: "me" } }));
  const r = await probeEndpoint(expected(base));
  server.close();
  assert.equal(r.ok, false);
  assert.match(r.reasons[0] ?? "", /x402 quote/);
});

test("a quote for a different resource fails, so a URL cannot borrow another's quote", async () => {
  const { server, base } = await serve(() => {
    const b = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const q = v2(b);
    const body = { ...q.body, resource: { url: "https://elsewhere.example/other" } };
    return { status: 402, headers: { "payment-required": encodeHeader(body) }, body };
  });
  const r = await probeEndpoint(expected(base));
  server.close();
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes("different resource")));
});

test("a quote with no option on the registered network fails", async () => {
  const { server, base } = await serve(() => v2(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, { network: "base-sepolia" }));
  const r = await probeEndpoint(expected(base));
  server.close();
  assert.equal(r.ok, false);
  assert.match(r.reasons[0] ?? "", /hedera:testnet/);
});

test("a redirect is refused rather than followed", async () => {
  const { server, base } = await serve(() => ({ status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }));
  const r = await probeEndpoint(expected(base));
  server.close();
  assert.equal(r.ok, false);
  assert.match(r.reasons[0] ?? "", /redirected/);
});

test("a v1 quote is read too", async () => {
  const { server, base } = await serve(() => {
    const b = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    return {
      status: 402,
      body: { x402Version: 1, accepts: [{ scheme: "exact", network: "hedera:testnet", maxAmountRequired: "10000", asset: "0.0.0", payTo: PAYEE, resource: `${b}/forecast` }] },
    };
  });
  const r = await probeEndpoint(expected(base));
  server.close();
  assert.equal(r.ok, true, r.reasons.join("; "));
});

/* ----------------------------------------------------- what it will not call -- */

test("addresses on a private network are blocked", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1"]) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
  for (const ip of ["::1", "fe80::1", "fc00::1", "fd12::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
    assert.equal(isBlockedAddress(ip), true, ip);
  }
});

test("public addresses are not blocked", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111"]) {
    assert.equal(isBlockedAddress(ip), false, ip);
  }
});

test("without the local allowance a loopback endpoint is never called", async () => {
  delete process.env["REGISTRY_ALLOW_LOCAL"];
  let called = false;
  const { server, base } = await serve(() => {
    called = true;
    return { status: 402, body: {} };
  });
  const r = await probeEndpoint(expected(base));
  server.close();
  assert.equal(called, false, "the server must not have been contacted");
  assert.equal(r.ok, false);
  assert.match(r.reasons[0] ?? "", /https|private/);
});

test("a metadata address is refused outright, https or not", async () => {
  delete process.env["REGISTRY_ALLOW_LOCAL"];
  const r = await probeEndpoint({ ...expected("x"), url: "https://169.254.169.254/latest/meta-data" });
  assert.equal(r.ok, false);
  assert.match(r.reasons[0] ?? "", /private/);
});

test("a URL with credentials in it is refused", async () => {
  const r = await probeEndpoint({ ...expected("x"), url: "http://user:pass@127.0.0.1/x" });
  assert.equal(r.ok, false);
  assert.match(r.reasons[0] ?? "", /credentials/);
});

test("a scheme other than http and https is refused", async () => {
  const r = await probeEndpoint({ ...expected("x"), url: "file:///etc/passwd" });
  assert.equal(r.ok, false);
  assert.match(r.reasons[0] ?? "", /http/);
});
