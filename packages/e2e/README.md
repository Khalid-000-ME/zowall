# @zowall/e2e

Runs the whole control against the live chain and prints an explorer link for
every transaction.

```bash
set -a; source .env.local; set +a

node packages/e2e/src/flow.ts                     # just run it
node packages/e2e/src/flow.ts --refund --cleanup  # and restore the vault
```

## What it does

| # | Scenario | Expected |
|---|---|---|
| 1 | prompt-injected ad-hoc payment | `REJECTED` `NO_PO` |
| 2 | genuine vendor signature, payee swapped | `REJECTED` `PAYEE_MISMATCH` |
| 3 | half the order, matching | `PAID`, real USDT moves |
| 4 | that same invoice again | `REJECTED` `DUPLICATE_INVOICE` |

**The refusals run first, on purpose.** Run them after the purchase order has
paid out and closed and each one also picks up `PO_CLOSED` and
`QTY_OVER_RECEIVED` — all true, but it makes the output ambiguous about which
rule actually caught the problem. Step 3 invoices only half the order so the PO
stays open, which is what keeps step 4 down to a single code.

## Why it restores itself

`--refund` hands the vendor's USDT back to the vault and `--cleanup` releases
the un-invoiced half of the purchase order. Without both, every run permanently
costs part of the treasury, and testnet USDT is not freely refillable.

The run sizes the order to whatever is *unencumbered* in the vault, not the raw
balance, because `createPO` checks `balance >= totalEncumbered + total`. Sizing
off the balance makes the second rehearsal revert.

## The RPC is unreliable

The public Whitechain Sepolia RPC returns intermittent `503 no backend is
currently healthy` and occasional timeouts, so every call retries with backoff.
Set `EVM_RPC_URL` to point at a different endpoint if the public one is
unreliable.
