# Zowall

**No PO, no pay.** USDT on Whitechain, refusals on Hedera HCS.

Three-way invoice match for agents that hold a wallet.

> **Note:** this is the developer README for the build in progress. The
> submission README - deployed addresses, settled transaction ids, the
> track-requirement table, the demo video - is written once there is something
> deployed to point at.

An agent with a wallet pays whatever its context tells it to. Every existing
control checks one dimension: a spend cap checks the amount, an allowlist
checks the counterparty, a reputation screen checks history, an approval group
checks who signed. None of them check whether the thing was ever ordered and
received.

That check has a name in every ERP on earth - the three-way match - and no
agent has one.

**The load-bearing sentence:** the language model never decides whether money
moves. It parses documents and proposes. A deterministic contract disposes.

## Deployed

| | |
|---|---|
| Network | Whitechain Sepolia (chain id **1874**) |
| `ZowallGate` | [`0x2ced329ea70c1740a707e620668575e79ec1f84d`](https://explorer.testnet.whitechain.io/address/0x2ced329ea70c1740a707e620668575e79ec1f84d) — **verified** |
| USDT (6 dp) | [`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`](https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7) |
| Attestor | `0xdCa82154FA9f7a95277729e9a6861f4E023ab997` |

A real USDT payment settled through the main flow, and three refusals, each a
transaction anyone can open:

| Outcome | Transaction |
|---|---|
| **PAID** 2.00 USDT | [`0x46b49fef…`](https://explorer.testnet.whitechain.io/tx/0x46b49fef136d637c5da7adf0cd3659249409ab3cac838e7e034110f9daa74525) |
| `REJECTED NO_PO` | [`0x86c28af0…`](https://explorer.testnet.whitechain.io/tx/0x86c28af012fa3ea3a81ca4844a60fd1178d52d87d8fea8c5b8e0f6bfe0917abe) |
| `REJECTED PAYEE_MISMATCH` | [`0x253b04c8…`](https://explorer.testnet.whitechain.io/tx/0x253b04c84bcb150460d3c0f13e94d167b9219c7ff3f1b68904aac02ccb4cc913) |
| `REJECTED DUPLICATE_INVOICE` | [`0x508e6480…`](https://explorer.testnet.whitechain.io/tx/0x508e6480e160be01d984386564c6f6a621bda3392f8aafb4bbff52b6618d9133) |

Reproduce all four:

```bash
set -a; source .env.local; set +a
node packages/e2e/src/flow.ts --refund --cleanup
```

Amounts are small because the testnet treasury is 5 USDT. The control is
identical at any scale, and the runner sizes each order to what the vault
actually holds.

## Layout

```
packages/
  gate-core/     the match engine. pure, no chain, no network, no dependencies
  contracts/     ZowallGate.sol + MatchEngine.sol (Foundry)
  journal/       Hedera HCS writer, mirror reader, replay CLI
  world/         World ID enrollment, freshness, EIP-712 attestations
  sdk/           the drop-in: gate.pay(invoice, sig)
  agent/         a deliberately gullible buyer agent
apps/
  web/           Next.js 16: dashboard, vendor portal, attack console, API
```

Each package has its own README explaining the decisions inside it.
`packages/gate-core/README.md` is the one to read first.

## Running it

Needs Node 24+, pnpm 10+ and Foundry.

```bash
pnpm install
cp .env.example .env.local     # then fill it in; nothing has a working default

pnpm test                      # every package
pnpm test:contracts            # forge, 25 scenarios
pnpm dev                       # the web app
```

## Why there are two chains

**Whitechain** holds the money. A purchase order reserves (encumbers) its total
against a real USDT balance, so a vendor can verify on-chain that funds are set
aside against their order *before they ship* - without being given access to
the buyer's books. A matched invoice settles in about a second instead of
net-60.

**Hedera** holds the record. The buyer must not be able to rewrite the log of
its own refusals. The journal topic has a submit key, so only this service can
append, and no admin key, so it is immutable and undeletable. Anyone can read
it from a public mirror node and run the replay without asking us.

The two are bound by a content digest that `gate-core` computes and both sides
carry, so the claim is checkable by a stranger rather than asserted:

```bash
node packages/journal/src/cli.ts replay <topicId> --chain 1874 --gate 0x...
```

## The rules

Eleven reason codes, evaluated in a fixed order, **all** failures returned.
Eight are hard and reject outright; three are soft and park the invoice for a
different human.

| Code | Severity | Check |
|---|---|---|
| `NO_PO` | hard | no existing, open purchase order |
| `BAD_SIGNATURE` | hard | signer is not the PO's vendor key, or the payload expired |
| `PAYEE_MISMATCH` | hard | invoice payee is not the PO payee |
| `PO_EXPIRED` | hard | invoice arrived after expiry |
| `PO_CLOSED` | hard | closed, or fully invoiced |
| `DUPLICATE_INVOICE` | hard | this invoice hash was decided before |
| `BUDGET_EXCEEDED` | hard | no reservation left for this quantity at the agreed price |
| `SOD_VIOLATION` | hard | one human holds two roles on one PO |
| `NO_RECEIPT` | soft | nothing recorded as received yet |
| `QTY_OVER_RECEIVED` | soft | invoiced more than arrived |
| `PRICE_OVER_TOLERANCE` | soft | unit price above the agreed price plus tolerance |

Three design rules that are easy to get wrong:

**One fact, one code; the most specific wins.** `NO_RECEIPT` suppresses
`QTY_OVER_RECEIVED`. `QTY_OVER_RECEIVED` suppresses `BUDGET_EXCEEDED` - a
quantity variance is something a human can review, and hard-rejecting it would
mean the exception queue never sees the case it exists for.

**The reservation covers the tolerance ceiling, not the headline total.** A 5%
tolerance means an invoice at 42 against a PO at 40 is legitimate, so reserving
only 40 would refuse to settle an invoice the rules just approved.

**An override is a purchase order amendment.** When a third human accepts a
variance that costs more than was reserved, the shortfall is drawn from
*unencumbered* balance and recorded in the event. It can never come out of
another purchase order's reservation.

## Segregation of duties

The creator, the receiver and the approver must be three different humans, and
that is enforced on-chain against World ID enrollment nullifiers.

A nullifier is scoped to RP + action and issued once per human per action, so
per-event proofs cannot be compared across roles. Identity therefore comes from
a single enrollment action, and freshness comes from repeatable session proofs.
`packages/world/README.md` has the full reasoning and the documented fallback.

## License

MIT. See `LICENSE`.
