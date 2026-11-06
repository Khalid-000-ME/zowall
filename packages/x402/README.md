# @zowall/x402

A three-way match in front of an agent's x402 payments.

x402 answers *how* a machine pays. It is deliberately silent on whether the
payment should happen at all — that is the resource server's business, and the
protocol is better for not having an opinion. But it leaves the buyer's side
empty: an agent with a funded wallet will satisfy any 402 it is shown, from any
endpoint, at any price, as many times as it is asked.

This is the missing half. It wraps the agent's `fetch`, and every 402 it sees is
matched against a mandate a human actually signed before the payment is
authorised.

```ts
import { createGuard, withZowall } from "@zowall/x402";

const guarded = withZowall({
  guard: createGuard({ keccak256, findMandate, roles }),
  signPayment,          // your existing x402 client still does the paying
});

await guarded("https://api.example.com/premium");
```

Anything that is not a 402 passes straight through, so wrapping a client costs
nothing on free endpoints and no application code changes.

## Why a 402 is an invoice

A payment-required response names a payee, a price, and a thing being sold, and
it asks to be paid. That is an invoice. The only reason it has never been
treated as one is that there was nothing to compare it against.

| x402 field | Invoice field |
|---|---|
| `payTo` | payee |
| `amount` (v1: `maxAmountRequired`) | unit price |
| `resource` | which mandate authorises this spend |
| one call | one unit |

Once the mapping exists, the eleven reason codes in `@zowall/gate-core` apply
unchanged. There is no second rules engine and no looser rule set for machines.

| What happens | Code |
|---|---|
| An endpoint nobody authorised | `NO_PO` |
| The quote asks to be paid somewhere else | `PAYEE_MISMATCH` |
| The price went up after the mandate was signed | `PRICE_OVER_TOLERANCE` |
| The same quote replayed | `DUPLICATE_INVOICE` |
| The authorised call count is used up | `QTY_OVER_RECEIVED` |
| The allowance is spent | `BUDGET_EXCEEDED` |
| The mandate expired | `PO_EXPIRED` |

Every failing code comes back, not just the first.

## Where it sits

```
agent  ->  withZowall  ->  resource server
               |
               +-- 402 arrives: match the quote against a mandate
               +-- refused: the payment is never signed
               +-- allowed: sign, retry, record what settled
```

The middleware never holds a key. `signPayment` is your x402 client's job, and
it is only ever called for a quote that passed. A refusal is returned as a 402
carrying the reason codes, so an agent that already handles "payment required"
handles this too — or `onRefusal: "throw"` if you would rather not check.

## Two honest differences from the goods case

**Authenticity.** A goods invoice carries the vendor's EIP-712 signature. A 402
quote does not: it arrives over TLS from the resource server. So the signature
check is satisfied by the transport, and the real protection against being
redirected is the payee comparison, which is unaffected.

**Delivery.** In x402 the service is delivered as it is paid for, so there is no
separate goods-receipt moment. The human approval happens once, up front, when
the mandate is created for N calls. That pre-authorised quantity is the receipt,
which makes `QTY_OVER_RECEIVED` mean exactly "this agent has used up what a
person agreed it could buy".

## Not skippable: the payer's key does the enforcing

A wrapper around `fetch` is a control the agent can simply not call. So on Hedera
the guard is also written into the payer account's key, which the network
evaluates on every transaction:

```
2 of [ agent key,  2 of [ guardian 1, guardian 2, guardian 3 ] ]
```

The account cannot move a tinybar unless the agent and a quorum of independent
guardians signed the same transaction, and an x402 facilitator checks the
signatures against that key before it sponsors a payment.

```ts
import { buildAgentSignedTransfer, createGuardian, guardianQuorum, toPayload }
  from "@zowall/x402/hedera";

signPayment: async (quote) => {
  const tx = await buildAgentSignedTransfer({ client, requirements: quote, payer, agent });
  const { bytes } = await guardianQuorum(tx, quote, guardians, 2);
  return { payload: toPayload(bytes) };
},
```

Each guardian trusts neither the caller nor the quote. It decodes the transaction,
confirms it is a plain transfer that pays exactly the quoted amount to the quoted
account in the quoted asset with the facilitator as fee payer and nobody else
receiving anything, runs the mandate check itself, and only then signs.

| Party | Alone |
|---|---|
| the agent | cannot pay |
| one guardian | cannot pay |
| a hacked middleware | cannot pay; it can lie about the quote, but the guardians read the bytes |
| the agent and a guardian quorum | pay, after each guardian checked the bytes against the mandate |

`guardianQuorum` routes around a guardian that refuses or is unreachable, so one
bad guardian neither enables a payment nor blocks a good one.

`scripts/guardian-setup.ts` creates such an account and shows the refusals against
the live network. `scripts/facilitator-live.ts` takes a guarded payment to a real
facilitator: the agent alone is refused with
`invalid_exact_hedera_payload_signature_invalid`, the guarded payment verifies and
settles.

## Protocol versions

It speaks x402 v2, which is what the Hedera facilitators run: a base64
`PAYMENT-REQUIRED` header, `amount`, CAIP-2 networks such as `hedera:testnet`, a
`PAYMENT-SIGNATURE` request header and a `PAYMENT-RESPONSE` reply. v1 (`X-PAYMENT`,
`maxAmountRequired`) is still read. Either is normalised to one shape before the
guard sees it, and the retry goes out in the header the server's version expects.

## Tests

```bash
node --test packages/x402/test/*.test.ts
```

Thirty-seven of them, and most are attacks: an unauthorised endpoint, a payee
swapped at quote time, a price raised after the fact, a replay, an exhausted
allowance, a transaction that pays someone else, a middleware that lies to the
guardians. A guard that only ever says yes is indistinguishable from no guard.
