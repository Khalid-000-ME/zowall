# @zowall/world

World ID: who the three humans are, and whether one of them is here right now.

Ported from `swish`, an earlier project, with its ed25519 +
`sui::ed25519_verify` attestation swapped for **EIP-712 + `ecrecover`**. The pattern is unchanged and
it is the part that matters: the backend signs a canonical message only after a
proof verifies, and the chain re-derives that message independently.

```
src/roles.ts      the three roles; codes match ZowallGate.Role
src/verify.ts     server-side v4 verification, forwarded as-is
src/registry.ts   enrollment registry - stable personIds
src/freshness.ts  session proofs, with a documented fallback
src/attest.ts     EIP-712 role attestation signer
```

## The nullifier problem

A nullifier is scoped to **RP + action** and issued **once per human per
action**. So you cannot compare two per-event nullifiers to find out whether
the same person did both things, and you cannot ask one person to prove
uniqueness twice for the same action.

Hence two layers:

**Enrollment, once per person.** One uniqueness proof under one action,
`zowall-enroll`. That nullifier becomes the person's stable `personId`.
Different humans give different ids, and they are comparable because they all
came from the same action.

**Freshness, every sensitive act.** Session proofs (`createSession` /
`proveSession`), which sign without an action and are therefore repeatable.

Segregation of duties compares **enrollment** personIds, never per-event ones:

```
po.creatorPersonId != receipt.receiverPersonId != hold.approverPersonId
```

**The fallback is safe because of this split.** If session proofs are not
reachable, `WORLD_FRESHNESS_MODE=per-role` takes freshness from three
per-role uniqueness actions instead. It costs repeatability - one proof per
human per role for the event - but identity still comes from the registry, so
the control itself is unaffected.

## Which credential, and why only that one

We need **uniqueness**. Not identity, not age, not nationality, not a passport.
The minimum sufficient assurance for "a different human approved this" is a
per-action pseudonym, which is exactly what a nullifier is. Asking for anything
more would collect personal data the control does not need in order to work.

## Verified against the installed SDK

Checked against `@worldcoin/idkit-core@4.6.0` and `@worldcoin/idkit@4.6.0` in
this repo rather than taken from docs:

| Surface | Status |
|---|---|
| `createSession(config)` | present |
| `proveSession(session_id, config)` | present |
| `IDKitSessionWidget` | present in `@worldcoin/idkit` |
| session result shape | carries `session_id`, no `action` — this is what makes it repeatable |
| `environment` | `"production" \| "staging" \| "sandbox"` |

So session proofs are real and the preferred mode works. The per-role fallback
is insurance, not the plan.

**`staging` and `sandbox` are different environments**, with different verify
endpoints (`staging.world.org/verify` vs `sandbox.world.org/verify`). Sandbox
needs the Sandbox World ID app installed from TestFlight or Play; staging does
not.

## Things that cost debugging time, recorded so they cost it once

- Forward the `IDKitResult` **as-is**. Wrapping it returns
  `validation_error: responses array is required`.
- The nullifier is in `responses[].nullifier`, not at the root.
- The signed message is `version || nonce || created_at || expires_at` (49
  bytes), plus a hashed action for uniqueness proofs (81 bytes). Sending
  `action: ""` while signing without an action gives `invalid_rp_signature` -
  a blank action is a contradiction, not a third mode.
- The nonce is single-use: fetch a fresh `rp_context` each time the widget
  opens, or get `duplicate_nonce`.
- `nullifier_replayed` means World recognised the human and refused a second
  uniqueness proof. The integration is working; the question was wrong.
- The Portal app must be in **`external`** mode, not `mini-app`. Fixed at
  create time.
- In non-production environments, proofs may be simulated and the identities
  behind them are not real. Nothing here treats a staging nullifier as evidence
  of real-world uniqueness.
