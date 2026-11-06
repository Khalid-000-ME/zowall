import assert from "node:assert/strict";
import test from "node:test";

import { CheckoutError, createCheckoutSession, serialiseInvoice } from "../src/checkout.ts";
import type { Invoice } from "../src/index.ts";

const invoice: Invoice = {
  poId: 6n,
  vendor: "0x1111111111111111111111111111111111111111",
  payee: "0x2222222222222222222222222222222222222222",
  qty: 2n,
  unitPrice: 100_000n,
  invoiceHash: `0x${"ab".repeat(32)}`,
  nonce: 12345678901234567890n,
  deadline: 1_800_000_000n,
};

test("amounts travel as strings, so a large nonce is not rounded by JSON", () => {
  const wire = serialiseInvoice(invoice);
  assert.equal(wire.nonce, "12345678901234567890");
  assert.equal(wire.unitPrice, "100000");
  assert.equal(typeof wire.poId, "string");
});

test("a session is created with the merchant's key and the invoice as signed", async () => {
  let seen: { url: string; auth: string | null; body: Record<string, unknown> } | null = null;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    seen = {
      url,
      auth: new Headers(init.headers).get("authorization"),
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
    };
    return new Response(JSON.stringify({ id: "cs_abc", url: "https://pay.example.com/checkout/cs_abc", status: "open" }), {
      status: 201,
    });
  }) as unknown as typeof fetch;

  const out = await createCheckoutSession(
    { baseUrl: "https://pay.example.com/", apiKey: "sk_live", fetch: fetchImpl },
    { invoice, signature: `0x${"cd".repeat(65)}`, description: "2 cables", successUrl: "https://shop.example/thanks" },
  );

  assert.equal(out.url, "https://pay.example.com/checkout/cs_abc");
  assert.equal(seen!.url, "https://pay.example.com/api/checkout/sessions");
  assert.equal(seen!.auth, "Bearer sk_live");
  assert.equal(seen!.body["description"], "2 cables");
  assert.equal(seen!.body["cancelUrl"], undefined, "an option that was not given is not sent");
});

test("a refusal from the gateway surfaces as an error with its status", async () => {
  const fetchImpl = (async () =>
    new Response(JSON.stringify({ error: "Invalid API key." }), { status: 401 })) as unknown as typeof fetch;

  await assert.rejects(
    createCheckoutSession(
      { baseUrl: "https://pay.example.com", apiKey: "wrong", fetch: fetchImpl },
      { invoice, signature: `0x${"cd".repeat(65)}` },
    ),
    (e: unknown) => e instanceof CheckoutError && e.status === 401 && /Invalid API key/.test(e.message),
  );
});
