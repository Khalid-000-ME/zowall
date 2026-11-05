# @zowall/gate-core

The match engine. No chain, no network, no runtime dependencies.

This is the module to read when you want to know how the decision is made.
One file per concern, one function per reason code, one test per reason code.

```
src/codes.ts      reason codes, severity, the bitmask shared with the contract
src/types.ts      domain types; amounts are USDT base units (6 decimals)
src/money.ts      integer money and tolerance math
src/rules.ts      one pure function per reason code
src/evaluate.ts   runs every rule, returns every failure
src/canonical.ts  the digest that binds Whitechain to the Hedera journal
```

The same module runs in the contract's test suite, in the x402 endpoint and in
the UI preview, so the three can never disagree about a decision.

```bash
pnpm --filter @zowall/gate-core test   # node's own test runner, no vitest
```

## Decisions worth knowing about

**Every failing code is returned, not the first.** A clerk needs the whole list
to act once.

**Hard codes reject, soft codes hold.** A rejected invoice parks nothing and no
human can wave it through. A held invoice keeps the funds encumbered and a
*different* human may release it.

**One fact, one code - the most specific wins.** `NO_RECEIPT` suppresses
`QTY_OVER_RECEIVED`, because "nothing arrived" already says it.
`QTY_OVER_RECEIVED` suppresses `BUDGET_EXCEEDED`, because a quantity variance is
something a human can review, and hard-rejecting it would mean the exception
queue never sees the case it exists for.

**keccak256 is injected, not imported.** That is what keeps the package
dependency-free: the caller passes viem's implementation, or the contract uses
its own.

**Person identity is an enrollment nullifier, never a per-event one.** A World
ID nullifier is scoped to one action, so per-event proofs cannot be compared
across roles. Segregation of duties compares stable enrollment `personId`s.
