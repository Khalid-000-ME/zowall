# @zowall/sdk

The drop-in for an agent that pays: `gate.pay(invoice, signature)`.

## Quickstart

A runnable end-to-end example is in [`examples/quickstart.ts`](examples/quickstart.ts). It reads an
order, has the vendor sign an invoice, asks the gate what would happen, then pays:

```bash
set -a; source .env.local; set +a
PO_ID=<order id> QTY=<units> node packages/sdk/examples/quickstart.ts
```

It prints `PAID` and a transaction link for an order that has a receipt, or the reason codes if
it does not. The full steps, including the x402 middleware and the reference, are on the app's
`/docs` page.
