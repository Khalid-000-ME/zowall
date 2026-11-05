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
| `ZowallGate` | [`0x1fcb96e5e1a092bab2376517036113beb3cc9c5a`](https://explorer.testnet.whitechain.io/address/0x1fcb96e5e1a092bab2376517036113beb3cc9c5a) — **verified** |
| Hedera journal topic | [`0.0.11326973`](https://hashscan.io/testnet/topic/0.0.11326973) |
| USDT (6 dp) | [`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`](https://explorer.testnet.whitechain.io/address/0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7) |
| Attestor | `0xdCa82154FA9f7a95277729e9a6861f4E023ab997` |

A real USDT payment settled through the main flow, and three refusals, each a
transaction anyone can open:

| Outcome | Transaction |
|---|---|
| **PAID** 2.00 USDT | [`0x6d96e1a9…`](https://explorer.testnet.whitechain.io/tx/0x6d96e1a9be72822e4a9bea7d23ce1144de8f3b1e585fe92428fea7c5e6f26556) |
| `REJECTED NO_PO` | [`0x995a0979…`](https://explorer.testnet.whitechain.io/tx/0x995a097955c6145ee18586f71ebecef11559082e106b39f04880b4c68594b231) |
| `REJECTED PAYEE_MISMATCH` | [`0x85078ec5…`](https://explorer.testnet.whitechain.io/tx/0x85078ec5f00f6b4fca2a290cf08fbe64b6803556089ad6e0546de941e660ab44) |
| `REJECTED DUPLICATE_INVOICE` | [`0xa785ef6d…`](https://explorer.testnet.whitechain.io/tx/0xa785ef6d3f8dca2b8650d07fc6031f4bdea499a1bacd76a1112538967f337243) |

All four are on the Hedera topic, and the replay recomputes every digest from
the chain's own logs:

```
$ node packages/journal/src/cli.ts replay 0.0.11326973

  OK    #1  REJECTED po#0 NO_PO · digest recomputed and matched
  OK    #2  REJECTED po#1 PAYEE_MISMATCH · digest recomputed and matched
  OK    #3  PAID po#1 clean · digest recomputed and matched
  OK    #4  REJECTED po#1 DUPLICATE_INVOICE · digest recomputed and matched

OK - journal and chain agree
```

Verify any single decision from its log alone, with nothing supplied by us:

```bash
node packages/e2e/src/verify-decision.ts 0x6d96e1a9be72822e4a9bea7d23ce1144de8f3b1e585fe92428fea7c5e6f26556
```

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
carry.

The `Decision` event carries the **448-byte preimage** the digest is taken
over, not just the digest. That is what makes the claim real rather than nearly
real: without it the digest covers quantities, prices, person ids and a nonce
that the log does not contain, so "replay our refusals without asking us" would
quietly require asking us. With it, `keccak256(preimage)` is the digest and the
digest is what the journal carries.

```bash
node packages/journal/src/cli.ts replay <topicId> --gate 0x... --rpc <url>
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
