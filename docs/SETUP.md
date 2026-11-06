# Setup

What to configure, in dependency order. Copy `.env.example` to `.env.local` at
the repo root and fill it in as you go — nothing has a working default, because
a build running on a placeholder credential is harder to debug than one that
fails loudly.

`pnpm install` symlinks the root `.env.local` into `apps/web`, which Next needs
because it only reads env files from its own directory.

Requires Node 24+, pnpm 10+ and Foundry.

---

## 1. Whitechain Sepolia keys

A deployer key, a vendor key, and a **quorum** of attestor keys, all generated
locally:

| Variable | Role | Needs funding |
|---|---|---|
| `PRIVATE_KEY` | Deploys the gate and holds the buyer treasury | WBT for gas, and USDT for the vault |
| `ATTESTOR_PRIVATE_KEYS` | Comma-separated. Each signs EIP-712 role attestations after verifying a World proof | no, they only sign |
| `ATTESTOR_ADDRESSES` | Their public addresses, comma-separated, passed to the constructor | no |
| `ATTESTOR_THRESHOLD` | How many must sign each attestation. Default 2 | no |

```bash
cast wallet new    # once per key
```

The gate accepts a role attestation only when `ATTESTOR_THRESHOLD` of the
attestors signed it, so one stolen key cannot mint a verified human. The
constructor refuses a threshold of zero, one that cannot be met, a duplicate
address and the zero address, because none of those can be fixed after
deployment. In production each attestor is a separate service; the demo runs them
in one process, which the contract does not care about.

Each attestation also commits to the exact action it authorises (the order terms,
the quantity received, the hold and its verdict), so one copied out of the mempool
cannot be reused for different arguments.

Fund the deployer with WBT for gas from the Whitechain testnet faucet, and with
USDT from whatever testnet source you have. The vault settles in the real
Whitechain Sepolia USDT at `USDT_ADDRESS` (6 decimals), not a stand-in token.

```bash
cast balance $DEPLOYER --rpc-url https://rpc.testnet.whitechain.io
cast call $USDT_ADDRESS "balanceOf(address)(uint256)" $DEPLOYER \
  --rpc-url https://rpc.testnet.whitechain.io
```

Divide the USDT figure by 1,000,000 to read it as whole tokens.

---

## 2. Deploy the gate → `GATE_ADDRESS`

```bash
set -a; source .env.local; set +a

forge script script/DeployGate.s.sol:DeployGate \
  --root packages/contracts \
  --rpc-url https://rpc.testnet.whitechain.io/ \
  --private-key $PRIVATE_KEY --broadcast
```

The script refuses to deploy unless the token at `USDT_ADDRESS` reports 6
decimals, so a wrong address fails immediately rather than making every amount
wrong by a factor of a trillion.

Verify the source:

```bash
forge verify-contract $GATE_ADDRESS src/ZowallGate.sol:ZowallGate \
  --root packages/contracts \
  --rpc-url https://rpc.testnet.whitechain.io/ \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.whitechain.io/api/ \
  --constructor-args $(cast abi-encode "constructor(address,address[],uint8)" \
    $USDT_ADDRESS "[$ATTESTOR_ADDRESSES]" $ATTESTOR_THRESHOLD) --watch
```

Two traps:

- Foundry fails with `Chain 1874 not supported` if `foundry.toml` contains an
  `[etherscan]` block, so the verifier is configured on the command line.
- The trailing `/api/` on the verifier URL is required.

Then send the vault its USDT:

```bash
cast send $USDT_ADDRESS "transfer(address,uint256)" $GATE_ADDRESS <amount> \
  --rpc-url https://rpc.testnet.whitechain.io --private-key $PRIVATE_KEY
```

**There is no withdraw function.** A vault the operator can empty is not a
reservation, and a vendor's reason to trust an encumbrance is that nobody can
take it back. The cost is that redeploying strands the old vault, so drain it
first with `packages/e2e/src/migrate.ts`, which moves the balance out through a
real purchase order that pays out. It signs the old gate's single-attestor
attestations with `OLD_ATTESTOR_PRIVATE_KEY`, and `MIGRATE_UNIT` sets the unit
price so a balance below one whole USDT can be recovered in a second pass.

---

## 3. Hedera account → `HEDERA_ACCOUNT_ID`, `HEDERA_PRIVATE_KEY`

Create a testnet account at https://portal.hedera.com/signup. It is funded
automatically. Copy the **Account ID** (`0.0.x`) and the **DER Encoded Private
Key**, and set `X402_PAY_TO` to the same account id — it both pays fees and
receives x402 payments.

The portal issues **ECDSA** keys. Paste exactly what it shows.

The parser picks its curve from the key's shape, which matters more than it
sounds: given plain 32-byte hex, Hedera's `fromStringDer` *succeeds* but reads
it as the wrong curve, so you get a well-formed key with the wrong public half
and every transaction fails precheck with `INVALID_SIGNATURE` — which reads as
a permissions problem and is really a parsing problem. DER (starting `302`/`303`)
is unambiguous; raw hex defaults to ECDSA, and `HEDERA_KEY_TYPE=ed25519`
overrides.

---

## 4. Journal topic → `HEDERA_TOPIC_ID`, `HEDERA_SUBMIT_KEY`

```bash
node packages/journal/src/cli.ts create-topic --gate $GATE_ADDRESS
```

**Run this once per gate.** The topic is created with every protection Hedera
offers for this job:

- a **submit key**, so only this service can append and a stranger cannot fill the
  journal with noise;
- **no admin key**, so the topic is immutable and undeletable. That is deliberate:
  it is a stronger claim than "we could edit it but won't";
- an **auto-renew account** (the operator) at the maximum period. An admin-less
  topic would otherwise expire, and the account can only be named at creation;
- a **memo** naming the chain and the gate, so anyone can check on the ledger whose
  journal it is.

A second run creates a second topic and orphans the first. `journal replay` checks
all four and fails if any is missing.

Custom topic fees (HIP-991) are not set: they charge strangers who may write, and
here strangers may not write at all.

---

## 5. World ID → `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY`

Create an app at https://developer.world.org.

- Set it to **`external`** mode, not `mini-app`. This is fixed at creation and
  cannot be changed, so getting it wrong means making a new app.
- If you are reusing an older app, click **Enable World ID 4.0** to complete RP
  registration, or v4 verification will not work.
- The signing key is shown **once**. If you lose it, rotate it.

Leave `WORLD_ACTION=zowall-enroll`. The action is a string defined in code, not
a portal value, and it is the one the enrollment registry expects.

`WORLD_ENVIRONMENT` is `staging` by default. `staging` approves proofs in the
web simulator. `sandbox` approves them in the World ID (Sandbox) app, which is
installed from TestFlight or a Google Play test track (request access in the
Developer Portal under World ID Sandbox). Both are verified through the same
endpoint the server already calls.

Check it:

```bash
curl -s localhost:3000/api/world/config | python3 -m json.tool
```

`{"configured": true, ...}` means the three values are right; anything in
`missing` is not. Add `?sign=1` to exercise the RP signature itself — but each
call burns a single-use nonce, so do not loop it.

People verify at `/enroll`: the page opens the IDKit widget with a request signed by the
server, sends the resulting proof to `/api/world/verify`, and the server alone turns it
into a `personId`. Enrolments are written to `apps/web/.data/enrollments.json`, because
World will not issue a second proof to the same person and an in-memory list would lose
them on restart. In staging the widget offers **Use the simulator** for test identities.

```
WORLD_REQUIRE_VERIFIED=true   # the attestor signs only for verified people
```

The app has no placeholder identities: only people who verified with World ID are
listed, so every role is played by a verified person and this setting changes
nothing visible. "Someone who has not verified" is shown as a denial, not as a
person.

Segregation of duties needs **three different enrolled people** for creator,
receiver and approver. In non-production environments the identities behind
proofs are not real, and `packages/world/README.md` explains why the design
does not depend on how they are obtained.

---

## 6. x402 and the guardian-protected payer

`FACILITATOR_URL` defaults to the official Hedera testnet facilitator,
`https://x402.org/facilitator`, which needs no key. Its fee payer is read from
`/supported` at request time. Alternatives that also need no key on testnet:
`https://api.testnet.blocky402.com` and `https://testnet.facilitator.launa.dev`.

The agent pays from an account whose key is a threshold structure, so the network
itself refuses a payment the guardians have not signed. Create it once:

```bash
set -a; source .env.local; set +a
node packages/x402/scripts/guardian-setup.ts
```

It creates a merchant account and the payer, proves against the live network that
the agent alone, the agent plus one guardian, and the guardians without the agent
are each refused with `INVALID_SIGNATURE`, then writes `X402_PAYER_ACCOUNT`,
`X402_PAY_TO`, `X402_AGENT_KEY`, `X402_GUARDIAN_KEYS` and
`X402_GUARDIAN_THRESHOLD` into `.env.local`. The keys are never printed.

To take a guarded payment to the facilitator by hand, verify only or with
settlement:

```bash
node packages/x402/scripts/facilitator-live.ts            # verify
node packages/x402/scripts/facilitator-live.ts --settle   # and settle
```

An x402 **mandate** is an ordinary order on the gate whose description is the
endpoint URL, whose payee is the merchant's account and whose quantity is the
number of calls. Raise one from two verified people:

```bash
RESOURCE_URL=http://localhost:3000/api/x402/resource \
  node packages/e2e/src/x402-mandate.ts
```

The mandate is matched by hashing the URL, so it is specific to the origin the
agent is pointed at.

The demo pays in HBAR (`asset` `0.0.0`, amounts in tinybars). To pay in HTS USDC
instead, the payer must associate the token with a `TokenAssociateTransaction`
first, or requests fail with `TOKEN_NOT_ASSOCIATED`.

---

## 7. Demo executor

The walkthrough, the attack console, the holds page and the order form all
submit real transactions from the server. That is switched off unless:

```
DEMO_ENABLED=true
VENDOR_PRIVATE_KEY=0x...      # signs vendor invoices; any funded-for-gas key
GATE_DEPLOY_BLOCK=<block>     # first block of the gate, bounds log scans
```

The executor signs as the buyer's relayer (`PRIVATE_KEY`), the vendor and the
attestor, and serialises its transactions on one nonce. Leave `DEMO_ENABLED`
unset on any deployment that should only be read: every page still works, from
chain data, but nothing can be submitted.

`GATE_DEPLOY_BLOCK` matters because the public RPC rejects `eth_getLogs` over
more than 10,000 blocks, so reading decisions back needs a starting point.

Use **Reset** on the walkthrough to cancel open orders and have the vendor return
what it was paid. The contract has no withdraw function, so that is the only way
funds go back to the vault.

## Check everything

```bash
pnpm install
pnpm test
pnpm dev
curl -s localhost:3000/api/health | python3 -m json.tool
```

`"missing": []` means every variable is set. Then run the whole control against
the chain:

```bash
set -a; source .env.local; set +a
node packages/e2e/src/flow.ts --refund --cleanup
```

If you change the contract, regenerate the ABI the SDK and web app share:

```bash
node scripts/gen-abi.mjs          # writes packages/sdk/src/abi.ts
node scripts/gen-abi.mjs --check  # fails if it is stale
```

Never commit `.env.local`. `git check-ignore .env.local` confirms it is ignored.
