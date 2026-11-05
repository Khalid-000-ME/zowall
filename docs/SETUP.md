# Credential setup

Five values left to fill in `.env.local`. Everything else is done, including
the deploy.

Every URL and constraint below was checked live on 2026-11-05. Do them in this
order — step 2 needs step 1, and step 4 needs step 3.

Your two EVM keys are already generated and in `.env.local`:

| Address | Role | Needs funding |
|---|---|---|
| `0xEA9C5E362a56662Eeb8c18962121C7A35Fc9B26d` | Deployer / buyer treasury | funded ✅ |
| `0xdCa82154FA9f7a95277729e9a6861f4E023ab997` | Attestor (signs role attestations) | no, it only signs |
| `0xa957e1D8ce0498A73b5AFC1b2f8CA0cB6678C127` | Demo vendor (e2e runner) | no |

**Steps 1 and 2 are done.** Five values remain: three from the World portal and
two from the Hedera portal (plus the topic, which a command creates).

---

## 1. Whitechain faucet → funds the deployer  ✅ DONE

The deployer holds WBT for gas and the vault holds 5 USDT. Kept for reference.

**Do this first.** It has a constraint that can block you, and if it does you
need to know in hour one, not hour twenty.

1. Open **https://faucet.testnet.whitechain.io**
2. Click **Continue with GitHub**.
   - **Your GitHub account must be at least 30 days old**, and each GitHub
     account gets **one drip only**. If yours is too new, borrow a teammate's —
     this is the single hardest thing to work around later.
3. Paste the deployer address: `0xEA9C5E362a56662Eeb8c18962121C7A35Fc9B26d`
4. Claim, then confirm it arrived:

```bash
cast balance 0xEA9C5E362a56662Eeb8c18962121C7A35Fc9B26d \
  --rpc-url https://rpc.testnet.whitechain.io
```

Nothing to copy into `.env.local` from this step.

### You also need test USDT

WBT is only gas. The vault has to hold **real Whitechain Sepolia USDT**
(`0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`, 6 decimals) because a
self-minted token does not count for the Whitechain tracks.

The faucet above may not dispense it. **Ask at the Whitechain booth for testnet
USDT to that address** — this is a question to ask in hour one, because without
it the main flow cannot settle and the track requirement goes unmet.

Check what you have:

```bash
cast call 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7 \
  "balanceOf(address)(uint256)" 0xEA9C5E362a56662Eeb8c18962121C7A35Fc9B26d \
  --rpc-url https://rpc.testnet.whitechain.io
```

Divide by 1,000,000 to read it as USDT. Aim for at least 10,000 (`10000000000`).

---

## 2. Deploy the gate → `GATE_ADDRESS`  ✅ DONE

Already deployed and verified:
**`0x2ced329ea70c1740a707e620668575e79ec1f84d`**, with 5 USDT in the vault.
`GATE_ADDRESS` is filled in. The rest of this section is kept for a redeploy.

Two things to know if you do redeploy:

- Foundry fails with `Chain 1874 not supported` if `foundry.toml` has an
  `[etherscan]` block, so verification flags go on the command line instead.
- **There is no withdraw function**, deliberately — a vault you can empty is
  not a reservation. So a redeploy strands the old gate's USDT unless you drain
  it first, and there is only one faucet drip. Drain it by raising a purchase
  order on the old gate that pays out to yourself.

Needs step 1 funded.

```bash
set -a; source .env.local; set +a

forge script script/DeployGate.s.sol \
  --root packages/contracts \
  --rpc-url https://rpc.testnet.whitechain.io/ \
  --private-key $PRIVATE_KEY \
  --broadcast --verify \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.whitechain.io/api/
```

The script refuses to deploy if the USDT contract does not report 6 decimals,
so a wrong token address fails loudly instead of silently breaking every amount.

Copy the printed `ZowallGate` address:

```
GATE_ADDRESS=0x...
```

Then confirm it shows as **verified** at
`https://explorer.testnet.whitechain.io/address/<GATE_ADDRESS>` — the
Whitechain tracks require verified, not just deployed. The trailing `/api/` on
the verifier URL is required.

Finally, send the vault its USDT:

```bash
cast send 0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7 \
  "transfer(address,uint256)" $GATE_ADDRESS 10000000000 \
  --rpc-url https://rpc.testnet.whitechain.io --private-key $PRIVATE_KEY
```

---

## 3. Hedera portal → `HEDERA_ACCOUNT_ID`, `HEDERA_PRIVATE_KEY`, `X402_PAY_TO`

1. Open **https://portal.hedera.com/signup** and create an account.
2. On the dashboard, make sure the network is **Testnet**. The account is
   funded automatically with **1000 HBAR**.
3. Copy two values:
   - **Account ID**, like `0.0.1234` →
     ```
     HEDERA_ACCOUNT_ID=0.0.1234
     X402_PAY_TO=0.0.1234
     ```
     (same value in both — this account both pays fees and receives x402 payments)
   - **DER Encoded Private Key**, a long string starting `303…` →
     ```
     HEDERA_PRIVATE_KEY=3030...
     ```

The portal issues **ECDSA** keys in DER form. Paste it exactly as shown — do
not convert it. The code accepts either curve, but a truncated or re-encoded
key fails with `BadKeyError`, which looks like a bad credential and is really a
bad paste.

---

## 4. Create the journal topic → `HEDERA_TOPIC_ID`, `HEDERA_SUBMIT_KEY`

Needs step 3.

```bash
set -a; source .env.local; set +a
node packages/journal/src/cli.ts create-topic
```

It prints:

```
topic      0.0.XXXXXX
submit key 302e...
hashscan   https://hashscan.io/testnet/topic/0.0.XXXXXX
```

```
HEDERA_TOPIC_ID=0.0.XXXXXX
HEDERA_SUBMIT_KEY=302e...
```

**Run this exactly once.** The topic is created with a submit key and **no
admin key**, which makes it immutable and undeletable — that is deliberate, and
it is the stronger claim to make to an auditor. A second run makes a second
topic and orphans the first.

Put the topic id in the README, and open the HashScan link to confirm it exists.

---

## 5. World Developer Portal → `WORLD_APP_ID`, `WORLD_RP_ID`, `WORLD_RP_SIGNING_KEY`

1. Open **https://developer.world.org** and sign in.
2. Create a new app.
   - **Set it to `external` mode, not `mini-app`.** This is fixed at creation
     and cannot be changed afterwards — getting it wrong means making a new app.
   - If you are reusing an older app, click the **Enable World ID 4.0** banner
     to complete RP registration, or v4 verification will not work.
3. Copy three values:
   ```
   WORLD_APP_ID=app_...
   WORLD_RP_ID=rp_...
   WORLD_RP_SIGNING_KEY=<signing_key.private_key>
   ```
   The signing key is **shown exactly once**. If you lose it, rotate it.
4. Leave `WORLD_ACTION=zowall-enroll` as it is. The action is defined in our
   code, not in the portal — it is just a string that scopes the uniqueness
   proof, and it is already the one the enrollment registry expects.
5. `WORLD_ENVIRONMENT` is already `staging`, which is what the simulator needs.
   Switch it to `production` only when testing with a real device.

Check it with the server running:

```bash
curl -s localhost:3000/api/world/config | python3 -m json.tool
```

`{"configured": true, ...}` means the three values are right. Anything in
`missing` is still wrong. Then `?sign=1` to test the signature itself — but
each call burns a single-use nonce, so do not loop it.

### Three identities for the demo

Segregation of duties needs **three different humans** — creator, receiver,
approver. At Mumbai, proofs use **mocked identities**, so ask at the World booth
how to get three distinct mocked identities in the simulator. Without three,
you cannot demonstrate the denied path, which is what the prize is for.

---

## 6. x402: associate USDC on the paying account

`FACILITATOR_URL` and `X402_ASSET` are already filled with verified values:

- facilitator `https://x402-hedera-production.up.railway.app`
- Hedera testnet USDC `0.0.429274` (the official `hedera-dev/x402-hedera` repo
  settles the `0.0.5449` ambiguity in the docs)

One thing is not automatic: the **paying** account must associate the USDC token
with a `TokenAssociateTransaction` first, or the call fails with
`TOKEN_NOT_ASSOCIATED`. Fund that account from the Circle testnet faucet and
associate the token before the paid-request demo.

Whether the **receiving** account also needs association is not documented —
**ask at the Hedera booth**, and check `X402_PAY_TO` can actually receive USDC
before relying on it in the demo.

Two more booth questions while you are there:

- Which facilitator is actually reliable this weekend, and does the hosted one
  above count as **"Official x402"** for the track?
- Does "no human approving" forbid a pre-signed human mandate?

---

## When you are done

```bash
pnpm install
pnpm dev
curl -s localhost:3000/api/health | python3 -m json.tool
```

`"missing": []` means everything is wired. Anything listed is still empty.

Never commit `.env.local` — it is gitignored, and `git check-ignore .env.local`
confirms it.
