/**
 * These tests exist to prove the middleware refuses.
 *
 * A guard that only ever says yes is indistinguishable from no guard at all,
 * so every case below is an attack on an agent's wallet that x402 on its own
 * would have paid without hesitating: an endpoint nobody authorised, a payee
 * swapped at quote time, a price raised after the mandate was signed, a quote
 * replayed, an allowance spent.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import type { Bytes32, PurchaseOrder, Roles } from "@zowall/gate-core";

import { createGuard } from "../src/guard.ts";
import { PaymentRefused, withZowall } from "../src/middleware.ts";
import { normaliseResource, resourceSpecHash } from "../src/quote.ts";
import {
  PAYMENT_HEADER,
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_RESPONSE_HEADER,
  PAYMENT_RESPONSE_HEADER_V1,
  PAYMENT_SIGNATURE_HEADER,
  encodeHeader,
  type PaymentRequirements,
} from "../src/types.ts";
import { parsePaymentRequired } from "../src/quote.ts";

/*
 * A stand-in hash. This package never puts a digest on a chain - it only has
 * to tell two quotes apart - so any collision-resistant function will do, and
 * sha256 keeps the test free of a keccak dependency.
 */
const keccak256 = (hex: `0x${string}`): `0x${string}` =>
  `0x${createHash("sha256").update(Buffer.from(hex.slice(2), "hex")).digest("hex")}`;

const RESOURCE = "https://api.example.com/v1/forecast";
const VENDOR = "0x1111111111111111111111111111111111111111" as const;
const PAYEE = "0x2222222222222222222222222222222222222222" as const;
const ATTACKER = "0x000000000000000000000000000000000000dEaD" as const;

const person = (n: number): Bytes32 => `0x${n.toString(16).padStart(64, "0")}` as Bytes32;
const ALICE = person(0xa1);
const BOB = person(0xb2);

const NOW = 1_800_000_000n;
const ROLES: Roles = { creatorPersonId: ALICE, receiverPersonId: BOB, approverPersonId: null };

/** 200 calls at 0.01 USDC, pre-authorised by a person. */
function mandate(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 7n,
    vendor: VENDOR,
    payee: PAYEE,
    specHash: resourceSpecHash(RESOURCE, keccak256),
    qty: 200n,
    unitPrice: 10_000n,
    priceTolBps: 500,
    qtyTolBps: 0,
    expiry: NOW + 86_400n,
    // Pre-authorised: the person agreed to 200 calls up front, which is what
    // stands in for a goods receipt when delivery and payment are the same act.
    received: 200n,
    invoicedQty: 0n,
    invoicedValue: 0n,
    creatorPersonId: ALICE,
    status: "Open",
    ...overrides,
  };
}

function quote(overrides: Partial<PaymentRequirements> = {}): PaymentRequirements {
  return {
    scheme: "exact",
    network: "hedera-testnet",
    amount: "10000",
    asset: "0.0.429274",
    payTo: PAYEE,
    resource: RESOURCE,
    description: "One forecast",
    maxTimeoutSeconds: 60,
    ...overrides,
  };
}

function guardFor(
  po: PurchaseOrder | null,
  extra: { seen?: boolean } = {},
) {
  return createGuard({
    keccak256,
    findMandate: (resource) =>
      po && po.specHash === resourceSpecHash(resource, keccak256) ? po : null,
    roles: ROLES,
    seen: () => extra.seen ?? false,
    now: () => NOW,
    nonce: () => 42n,
  });
}

/* ------------------------------------------------------------------ guard -- */

test("a quote covered by an open mandate is allowed", async () => {
  const d = await guardFor(mandate()).check(quote());
  assert.equal(d.allowed, true);
  assert.equal(d.decision.outcome, "PAID");
  assert.deepEqual(d.decision.codes, []);
});

test("an endpoint nobody authorised is refused as NO_PO", async () => {
  const d = await guardFor(mandate()).check(quote({ resource: "https://evil.example.com/drain" }));
  assert.equal(d.allowed, false);
  assert.ok(d.decision.codes.includes("NO_PO"));
  assert.equal(d.mandate, null);
});

test("a payee swapped at quote time is refused", async () => {
  const d = await guardFor(mandate()).check(quote({ payTo: ATTACKER }));
  assert.equal(d.allowed, false);
  assert.ok(d.decision.codes.includes("PAYEE_MISMATCH"));
});

test("a price raised beyond tolerance after the mandate is not paid", async () => {
  // 0.02 against an agreed 0.01 with 5% tolerance.
  const d = await guardFor(mandate()).check(quote({ amount: "20000" }));
  assert.equal(d.allowed, false);
  assert.ok(d.decision.codes.includes("PRICE_OVER_TOLERANCE"));
});

test("a price inside tolerance still pays", async () => {
  const d = await guardFor(mandate()).check(quote({ amount: "10400" }));
  assert.equal(d.allowed, true);
});

test("a replayed quote is refused as a duplicate", async () => {
  const d = await guardFor(mandate(), { seen: true }).check(quote());
  assert.equal(d.allowed, false);
  assert.ok(d.decision.codes.includes("DUPLICATE_INVOICE"));
});

test("spending past the authorised call count is refused", async () => {
  const d = await guardFor(mandate({ invoicedQty: 200n, invoicedValue: 2_000_000n })).check(quote());
  assert.equal(d.allowed, false);
  assert.ok(
    d.decision.codes.includes("QTY_OVER_RECEIVED") || d.decision.codes.includes("BUDGET_EXCEEDED"),
    `expected an exhaustion code, got ${d.decision.codes.join(",")}`,
  );
});

test("an expired mandate stops the agent", async () => {
  const d = await guardFor(mandate({ expiry: NOW - 1n })).check(quote());
  assert.equal(d.allowed, false);
  assert.ok(d.decision.codes.includes("PO_EXPIRED"));
});

test("every failing code comes back, not just the first", async () => {
  const d = await guardFor(mandate({ expiry: NOW - 1n })).check(
    quote({ payTo: ATTACKER, amount: "99999" }),
  );
  assert.ok(d.decision.codes.length > 1, `expected several codes, got ${d.decision.codes.join(",")}`);
  assert.ok(d.decision.codes.includes("PAYEE_MISMATCH"));
  assert.ok(d.decision.codes.includes("PO_EXPIRED"));
});

/* ------------------------------------------------------------- middleware -- */

const paymentRequired = (q: PaymentRequirements) =>
  new Response(JSON.stringify({ x402Version: 1, error: "payment required", accepts: [q] }), {
    status: 402,
    headers: { "content-type": "application/json" },
  });

test("a response that is not a 402 is passed straight through", async () => {
  let calls = 0;
  const guarded = withZowall({
    guard: guardFor(mandate()),
    signPayment: async () => "never",
    fetch: async () => {
      calls += 1;
      return new Response("free", { status: 200 });
    },
  });

  const res = await guarded("https://api.example.com/free");
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "free");
  assert.equal(calls, 1, "a free endpoint must not be called twice");
});

test("an allowed quote is signed once and retried with the payment header", async () => {
  const sent: Array<string | null> = [];
  let signed = 0;

  const guarded = withZowall({
    guard: guardFor(mandate()),
    signPayment: async () => {
      signed += 1;
      return "base64-payment";
    },
    fetch: async (_input, init) => {
      const header = new Headers(init?.headers).get(PAYMENT_HEADER);
      sent.push(header);
      return header
        ? new Response("the forecast", { status: 200 })
        : paymentRequired(quote());
    },
  });

  const res = await guarded(RESOURCE);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "the forecast");
  assert.equal(signed, 1);
  assert.deepEqual(sent, [null, "base64-payment"]);
});

test("a refused quote is never signed and never paid", async () => {
  let signed = 0;
  const requests: Array<string | null> = [];

  const guarded = withZowall({
    guard: guardFor(mandate()),
    signPayment: async () => {
      signed += 1;
      return "base64-payment";
    },
    fetch: async (_input, init) => {
      requests.push(new Headers(init?.headers).get(PAYMENT_HEADER));
      return paymentRequired(quote({ payTo: ATTACKER }));
    },
  });

  const res = await guarded(RESOURCE);

  assert.equal(signed, 0, "the wallet must never be asked to sign a refused payment");
  assert.deepEqual(requests, [null], "there must be no second, paying request");
  assert.equal(res.status, 402);

  const body = (await res.json()) as { zowall: { codes: string[]; outcome: string } };
  assert.equal(body.zowall.outcome, "REJECTED");
  assert.ok(body.zowall.codes.includes("PAYEE_MISMATCH"));
  assert.equal(res.headers.get("x-zowall-outcome"), "REJECTED");
});

test("onRefusal throw raises PaymentRefused carrying the decision", async () => {
  const guarded = withZowall({
    guard: guardFor(null),
    signPayment: async () => "never",
    onRefusal: "throw",
    fetch: async () => paymentRequired(quote()),
  });

  await assert.rejects(
    () => guarded(RESOURCE),
    (err: unknown) => {
      assert.ok(err instanceof PaymentRefused);
      assert.ok(err.decision.decision.codes.includes("NO_PO"));
      return true;
    },
  );
});

test("a 402 that is not an x402 quote is handed back untouched", async () => {
  const guarded = withZowall({
    guard: guardFor(mandate()),
    signPayment: async () => "never",
    fetch: async () => new Response(JSON.stringify({ error: "pay up" }), { status: 402 }),
  });

  const res = await guarded(RESOURCE);
  assert.equal(res.status, 402);
  // The body must still be readable: the middleware reads a clone, not the original.
  assert.deepEqual(await res.json(), { error: "pay up" });
});

test("what settled is reported back with the decision that allowed it", async () => {
  const settlement = {
    success: true,
    transaction: "0xabc",
    network: "hedera-testnet",
    payer: "0.0.8258062",
  };
  let recorded: { tx: string; codes: string[] } | null = null;

  const guarded = withZowall({
    guard: guardFor(mandate()),
    signPayment: async () => "base64-payment",
    onSettled: (s, d) => {
      recorded = { tx: s.transaction ?? "", codes: d.decision.codes };
    },
    fetch: async (_input, init) =>
      new Headers(init?.headers).get(PAYMENT_HEADER)
        ? new Response("ok", {
            status: 200,
            headers: {
              [PAYMENT_RESPONSE_HEADER_V1]: Buffer.from(JSON.stringify(settlement)).toString("base64"),
            },
          })
        : paymentRequired(quote()),
  });

  await guarded(RESOURCE);
  assert.deepEqual(recorded, { tx: "0xabc", codes: [] });
});

test("every decision is recorded, refusals included", async () => {
  const seen: string[] = [];
  const guard = createGuard({
    keccak256,
    findMandate: () => null,
    roles: ROLES,
    now: () => NOW,
    nonce: () => 1n,
    record: (d) => {
      seen.push(d.decision.outcome);
    },
  });

  await guard.check(quote());
  assert.deepEqual(seen, ["REJECTED"]);
});

test("a failing recorder cannot change the decision", async () => {
  const guard = createGuard({
    keccak256,
    findMandate: () => mandate(),
    roles: ROLES,
    now: () => NOW,
    nonce: () => 1n,
    record: () => {
      throw new Error("hedera is down");
    },
  });

  const d = await guard.check(quote());
  assert.equal(d.allowed, true, "an audit failure must not block a payment the rules allowed");
});

/* ---------------------------------------------------------------- mapping -- */

test("resources are compared without a trailing slash, and query strings count", () => {
  assert.equal(normaliseResource("https://API.example.com/v1/x/"), "https://api.example.com/v1/x");
  assert.notEqual(
    resourceSpecHash("https://a.example.com/x?page=1", keccak256),
    resourceSpecHash("https://a.example.com/x?page=2", keccak256),
  );
});

test("two calls to the same endpoint are different quotes, not a replay", async () => {
  let n = 0n;
  const guard = createGuard({
    keccak256,
    findMandate: () => mandate(),
    roles: ROLES,
    now: () => NOW,
    nonce: () => (n += 1n),
  });

  const first = await guard.check(quote());
  const second = await guard.check(quote());
  assert.notEqual(first.invoice.invoiceHash, second.invoice.invoiceHash);
});
