# @zowall/journal

The audit journal. Hedera Consensus Service for writing, a public mirror node
for reading, and a CLI that reconciles the two against the EVM log.

```bash
# one-off setup; prints the topic id and submit key
node packages/journal/src/cli.ts create-topic

# the thing to hand a judge. Needs no credentials.
node packages/journal/src/cli.ts replay 0.0.XXXXXX --chain 1874 --gate 0x...

# the last twenty entries, newest first
node packages/journal/src/cli.ts tail 0.0.XXXXXX
```

## Why Hedera is here at all

The buyer must not be able to rewrite the record of its own refusals. The topic
carries a **submit key**, so only this service can append, while **anyone can
read** - and the topic has **no admin key**, so it is immutable and
undeletable. That is a stronger thing to tell an auditor than "we could change
it but promise not to".

Remove this package and "every decision is independently replayable" collapses
to "trust our database".

## What replay actually proves

For each decision it takes the **EVM event's own fields**, recomputes the
digest with `gate-core`, and asserts it equals the digest written on Hedera.
Comparing two stored hashes would only prove nobody retyped one. Recomputing
from the chain's log proves the journal entry describes the decision the
contract actually made, and that neither side has been edited since.

It does **not** prove the rules are correct. The two test suites argue that.

The tests in `test/replay.test.ts` tamper on purpose - edited digests, softened
outcomes, dropped reason codes, restated quantities - because a reconciliation
that only ever prints `OK` proves nothing.

## Constraints that shaped the format

**One decision, one message.** An HCS message caps at 1024 bytes. Chunking
exists, but each chunk is a separate consensus message, which would break the
one-entry-per-decision property the replay depends on. `serialize()` throws
rather than chunk, so the failure happens at write time in a test, not during
a demo.

**Ids and hashes only.** Documents stay behind their hashes. Person ids are
deliberately **not** published: a World ID nullifier is pseudonymous but still
an identifier, and the topic is world-readable. The digest covers them, and
they come from the EVM event at replay time.

**The journal never blocks a payment.** `QueueingWriter` holds entries if
Hedera is unreachable and flushes them later. A late journal is acceptable; a
stuck gate is not.
