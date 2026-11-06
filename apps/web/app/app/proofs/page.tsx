import Link from "next/link";
import { headers } from "next/headers";

import { ProofHash } from "@/components/product/ProofHash";
import { ProofReplay } from "@/components/product/ProofReplay";
import { SponsorMark } from "@/components/product/SponsorHeading";
import { addressUrl, hashscanTopic, txUrl } from "@/lib/chains";
import { loadProofs } from "@/lib/proofs";
import { nameOf } from "@/lib/humans";
import { usdt } from "@/lib/product";

export const dynamic = "force-dynamic";

/**
 * Historical, verifiable transactions. They stay valid after any vault reset.
 *
 * The mandate is order #2 on the current gate, raised by Alice and signed for
 * by Bob, both World ID verified, with the attestor quorum signing each.
 */
const MANDATE_TXS = [
  {
    label: "Order raised",
    hash: "0x6bca7d7f38aa165fb76e196bdbf24cb50adc124f5a7067b060afa73bf22052ac",
  },
  {
    label: "Calls signed for",
    hash: "0xa62927559573222a8e4ba00818fe322895a164dd7be1b6d6560361a8a7a2eb51",
  },
] as const;

/** Real x402 v2 payments that settled on Hedera testnet through the official facilitator. */
const SETTLEMENTS = [
  { label: "Through the middleware, mandate checked", id: "0.0.9185802@1793975395.201075811" },
  { label: "Agent plus guardian quorum, direct", id: "0.0.9185802@1793966610.020477254" },
] as const;

const hashscanTx = (id: string) => `https://hashscan.io/testnet/transaction/${encodeURIComponent(id)}`;

function Paths({ items }: { items: ReadonlyArray<readonly [string, string]> }) {
  return (
    <ul className="ui-numlist">
      {items.map(([path, what], i) => (
        <li key={path} className="ui-numrow">
          <span className="ui-numrow-n">{String(i + 1).padStart(2, "0")}</span>
          <span className="ui-path">{path}</span>
          <span className="ui-numrow-sub">{what}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function Proofs() {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const p = await loadProofs(`${proto}://${host}`);

  const noAdmin = p.topic !== null && p.topic.adminKey === null;

  return (
    <>
      <header>
        <p className="ui-eyebrow">Proofs</p>
        <h1 className="ui-display">Check it without asking us.</h1>
        <p className="ui-lede">
          Every item below is read live from a public source - the Hedera mirror node, the
          Whitechain gate, the enrolment registry - and each one links to where a stranger can read
          it too. Beside each is the code that produces it.
        </p>
      </header>

      {!p.reachable ? (
        <div className="ui-note ui-note--warn" style={{ marginTop: "var(--space-5)" }}>
          The Whitechain testnet node did not answer, so on-chain items may be missing below.
          Reloading usually clears it.
        </div>
      ) : null}

      {/* ----------------------------------------------------------- Hedera -- */}
      <section className="ui-section">
        <div className="ui-proof-head">
          <h2 className="ui-title">Hedera</h2>
          <SponsorMark sponsor="hedera" />
        </div>

        <div className="ui-split">
          <div>
            <h3 className="ui-tile-title">A journal nobody can rewrite</h3>
            <p className="ui-lede">
              Each decision&rsquo;s digest is written to a consensus topic that has a submit key
              and no admin key, so it can be neither edited nor deleted. The replay recomputes the
              digest from Whitechain&rsquo;s own logs and compares.
            </p>
          </div>

          <div className="ui-panel">
            <div className="ui-row">
              <span className="ui-muted">Topic</span>
              {p.topic ? (
                <ProofHash value={p.topic.topicId} href={hashscanTopic(p.topic.topicId)} lead={3} tail={4} />
              ) : (
                <span className="ui-faint">not confirmed</span>
              )}
            </div>
            <div className="ui-row">
              <span className="ui-muted">Admin key</span>
              {p.topic ? (
                <span className={noAdmin ? "ui-chip ui-chip--ok" : "ui-chip ui-chip--bad"}>
                  {noAdmin ? "none: immutable and undeletable" : "present: the topic can be altered"}
                </span>
              ) : (
                <span className="ui-faint">mirror node did not answer</span>
              )}
            </div>
            <div className="ui-row">
              <span className="ui-muted">Submit key</span>
              {p.topic ? (
                <span className={p.topic.submitKeySet ? "ui-chip ui-chip--ok" : "ui-chip ui-chip--held"}>
                  {p.topic.submitKeySet ? "set: only this service can append" : "not set: anyone can append"}
                </span>
              ) : (
                <span className="ui-faint">mirror node did not answer</span>
              )}
            </div>
            <div className="ui-row">
              <span className="ui-muted">Memo</span>
              {p.topic ? (
                <span className="ui-mono" style={{ fontSize: 11.5, textAlign: "right", maxWidth: 360 }}>
                  {p.topic.memo}
                </span>
              ) : (
                <span className="ui-faint">mirror node did not answer</span>
              )}
            </div>
            <div className="ui-row">
              <span className="ui-muted">Renewal paid by</span>
              {p.topic?.autoRenewAccount ? (
                <span className="ui-mono">{p.topic.autoRenewAccount}</span>
              ) : (
                <span className="ui-chip ui-chip--held">none: the topic would expire</span>
              )}
            </div>
            <div className="ui-row">
              <span className="ui-muted">Entries</span>
              <span className="ui-mono">
                {p.journalEntries === null ? "not confirmed" : p.journalEntries}
              </span>
            </div>
            <div className="ui-row">
              <span className="ui-muted">Decisions on Whitechain</span>
              <span className="ui-mono">{p.reachable ? p.decisions.length : "not confirmed"}</span>
            </div>
            <div style={{ marginTop: "var(--space-4)" }}>
              <ProofReplay />
            </div>
            <pre className="ui-code" style={{ marginTop: "var(--space-4)" }}>
              {`node packages/journal/src/cli.ts replay ${p.topic?.topicId ?? "<topic>"} \\\n  --gate ${p.gate ?? "<gate>"}`}
            </pre>
          </div>
        </div>
      </section>

      <section className="ui-section">
        <div className="ui-split">
          <div>
            <h3 className="ui-tile-title">Middleware around x402</h3>
            <p className="ui-lede">
              The agent&rsquo;s fetch is wrapped. Each 402 is matched against a mandate a person
              signed before the wallet is asked to sign anything. The mandate is an order on
              Whitechain, not a config file.
            </p>
            <p style={{ marginTop: "var(--space-4)" }}>
              <Link href="/app/metered" className="ui-numrow-note">
                Run it against a live 402 →
              </Link>
            </p>
          </div>

          <div className="ui-panel">
            <div className="ui-row">
              <span className="ui-muted">Mandate found on-chain</span>
              {p.mandate ? (
                <span className="ui-chip ui-chip--ok">
                  order #{p.mandate.id.toString()} · raised by {nameOf(p.mandate.creatorPersonId)}
                </span>
              ) : (
                <span className="ui-chip ui-chip--held">none open for this endpoint</span>
              )}
            </div>
            {p.mandate ? (
              <div className="ui-row">
                <span className="ui-muted">Agreed</span>
                <span className="ui-mono">
                  {usdt(p.mandate.unitPrice)} per call · {p.mandate.received.toString()} calls signed
                  for · {p.mandate.invoicedQty.toString()} used
                </span>
              </div>
            ) : null}
            {MANDATE_TXS.map((t) => (
              <div key={t.hash} className="ui-row">
                <span className="ui-muted">{t.label}</span>
                <ProofHash value={t.hash} href={txUrl(p.chainId, t.hash)} />
              </div>
            ))}
            <div className="ui-row">
              <span className="ui-muted">Refusals proven by tests</span>
              <span className="ui-mono">19 tests</span>
            </div>
            <pre className="ui-code" style={{ marginTop: "var(--space-4)" }}>
              node --test packages/x402/test/*.test.ts
            </pre>
            <p className="ui-tile-body" style={{ marginTop: "var(--space-3)", marginBottom: 0 }}>
              The endpoint the live scenarios call is a local stand-in for a third-party x402 API.
              It settles nothing and reports its settlement as simulated.
            </p>
          </div>
        </div>
      </section>

      <section className="ui-section">
        <div className="ui-split">
          <div>
            <h3 className="ui-tile-title">A payer the middleware cannot be skipped around</h3>
            <p className="ui-lede">
              A control in the agent&rsquo;s own process is one the agent can skip. So the agent&rsquo;s
              payer account has a threshold key: the agent <strong>and</strong> a quorum of independent
              guardians must sign every payment. The facilitator checks that against the key on the
              ledger, and consensus checks it again.
            </p>
            <p className="ui-lede">
              Each guardian decodes the transaction itself and signs only if it pays exactly what the
              quote says, to the account the mandate names, within its price and call count.
            </p>
          </div>

          <div className="ui-panel">
            <div className="ui-row">
              <span className="ui-muted">Payer account</span>
              {p.guardian.payer ? (
                <ProofHash
                  value={p.guardian.payer}
                  href={`https://hashscan.io/testnet/account/${p.guardian.payer}`}
                  lead={3}
                  tail={5}
                />
              ) : (
                <span className="ui-faint">not configured</span>
              )}
            </div>
            <div className="ui-row">
              <span className="ui-muted">Key, as the ledger records it</span>
              {p.guardian.keyStructure ? (
                <span className="ui-mono" style={{ fontSize: 11.5, textAlign: "right", maxWidth: 360 }}>
                  {p.guardian.keyStructure}
                </span>
              ) : (
                <span className="ui-faint">not confirmed</span>
              )}
            </div>
            {SETTLEMENTS.map((t) => (
              <div key={t.id} className="ui-row">
                <span className="ui-muted">{t.label}</span>
                <a href={hashscanTx(t.id)} target="_blank" rel="noreferrer" className="ui-mono" style={{ fontSize: 12 }}>
                  {t.id}
                </a>
              </div>
            ))}
            <p className="ui-tile-body" style={{ marginTop: "var(--space-3)", marginBottom: 0 }}>
              Verified live against the facilitator: the agent signing alone is refused with{" "}
              <span className="ui-mono">invalid_exact_hedera_payload_signature_invalid</span>; the agent
              plus a guardian quorum is accepted and settles. Run both in{" "}
              <Link href="/app/metered">Metered spend</Link>.
            </p>
          </div>
        </div>
      </section>

      <section className="ui-section">
        <div className="ui-split">
          <div>
            <h3 className="ui-tile-title">Where the code is</h3>
            <p className="ui-lede">
              The Hedera integration and the middleware, by file. The repository is private for
              now, so these are paths rather than links.
            </p>
          </div>
          <Paths
            items={[
              ["packages/journal/src/hcs.ts", "createTopic (submit key, no admin key), JournalWriter, QueueingWriter"],
              ["packages/journal/src/mirror.ts", "reads the topic from a public mirror node, no credentials"],
              ["packages/journal/src/replay.ts", "recomputes each digest from the chain's logs and compares"],
              ["packages/gate-core/src/canonical.ts", "the 448-byte preimage and the digest both chains carry"],
              ["packages/x402/src/hedera.ts", "threshold-key payer, guardians that decode before they sign"],
              ["packages/x402/scripts/guardian-setup.ts", "creates the payer and proves agent-alone is refused"],
              ["apps/web/app/api/x402/resource/[[...rest]]/route.ts", "a real x402 v2 resource server using a facilitator"],
              ["packages/x402/src/middleware.ts", "withZowall: wraps fetch, never signs a refused quote"],
              ["packages/x402/src/guard.ts", "reuses the eleven reason codes unchanged on a 402 quote"],
              ["packages/x402/src/quote.ts", "maps payTo, maxAmountRequired and resource onto an invoice"],
              ["packages/x402/test/middleware.test.ts", "the attacks: unauthorised, payee swap, price hike, replay"],
              ["apps/web/app/api/x402/guarded/route.ts", "runs the middleware once and reports what it did"],
            ]}
          />
        </div>
      </section>

      {/* ------------------------------------------------------------ World -- */}
      <section className="ui-section">
        <div className="ui-proof-head">
          <h2 className="ui-title">World ID</h2>
          <SponsorMark sponsor="world" />
        </div>

        <div className="ui-split">
          <div>
            <h3 className="ui-tile-title">Three different humans, not three wallets</h3>
            <p className="ui-lede">
              Each person verifies once. The proof is validated on the server, and the nullifier
              becomes their id. The contract compares those ids, so one person cannot hold two
              roles on one order.
            </p>
          </div>

          <div className="ui-panel">
            <div className="ui-row">
              <span className="ui-muted">Action</span>
              <span className="ui-mono">{p.world.action}</span>
            </div>
            <div className="ui-row">
              <span className="ui-muted">Environment</span>
              <span className="ui-chip">{p.world.environment}</span>
            </div>
            {p.world.appId ? (
              <div className="ui-row">
                <span className="ui-muted">App</span>
                <span className="ui-mono">{p.world.appId}</span>
              </div>
            ) : null}
            <div className="ui-row">
              <span className="ui-muted">Attestor quorum (read from the gate)</span>
              {p.quorum ? (
                <span className="ui-chip ui-chip--ok">
                  {p.quorum.threshold} of {p.quorum.attestors.length} must sign
                </span>
              ) : (
                <span className="ui-faint">not confirmed</span>
              )}
            </div>
            <div className="ui-row">
              <span className="ui-muted">Verified people</span>
              <span className="ui-mono">{p.world.enrolled.length}</span>
            </div>
            {p.world.enrolled.map((person) => (
              <div key={person.personId} className="ui-row">
                <span>{person.name}</span>
                <ProofHash value={person.personId} href={null} lead={10} tail={6} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ui-section">
        <div className="ui-split">
          <div>
            <h3 className="ui-tile-title">Separation of duties, on-chain</h3>
            <p className="ui-lede">
              An order records its creator and its receiver, and the approval records the third
              person. The most recent held invoice where all three are different is below. If the contract had been given
              the same person twice it would have reverted.
            </p>
          </div>

          <div className="ui-panel">
            {p.world.threeParty ? (
              <>
                <div className="ui-row">
                  <span className="ui-muted">Approval</span>
                  <ProofHash
                    value={p.world.threeParty.resolution.txHash}
                    href={txUrl(p.chainId, p.world.threeParty.resolution.txHash)}
                  />
                </div>
                <div className="ui-row">
                  <span className="ui-muted">Order</span>
                  <span className="ui-mono">#{p.world.threeParty.resolution.poId.toString()}</span>
                </div>
                <div className="ui-row">
                  <span className="ui-muted">Raised by</span>
                  <span>{p.world.threeParty.names.creator}</span>
                </div>
                <div className="ui-row">
                  <span className="ui-muted">Signed for by</span>
                  <span>{p.world.threeParty.names.receiver}</span>
                </div>
                <div className="ui-row">
                  <span className="ui-muted">Approved by</span>
                  <span>{p.world.threeParty.names.approver}</span>
                </div>
                <div className="ui-row">
                  <span className="ui-muted">All three World ID verified</span>
                  <span
                    className={
                      p.world.threeParty.allEnrolled ? "ui-chip ui-chip--ok" : "ui-chip ui-chip--held"
                    }
                  >
                    {p.world.threeParty.allEnrolled ? "yes" : "no: an id the registry does not know"}
                  </span>
                </div>
              </>
            ) : (
              <div className="ui-note">
                No decision with three distinct people on record yet. Resolve a held invoice as a
                third person in Exceptions and it will appear here.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="ui-section">
        <div className="ui-split">
          <div>
            <h3 className="ui-tile-title">Where the code is</h3>
            <p className="ui-lede">
              The proof is only ever turned into an identity on the server. The browser never
              sends a personId and never receives anything it could forge one from.
            </p>
          </div>
          <Paths
            items={[
              ["apps/web/app/api/world/verify/route.ts", "the only place an enrolment is created"],
              ["packages/world/src/verify.ts", "forwards the proof to World's verify endpoint, reads the nullifier"],
              ["packages/world/src/registry.ts", "the enrolment registry that survives a restart"],
              ["packages/world/src/attest.ts", "quorum-signed EIP-712 attestations, bound to the action"],
              ["packages/contracts/src/SigLib.sol", "ecrecover on the attestation, on-chain"],
              ["packages/contracts/src/ZowallGate.sol", "reverts SodViolation; checks the quorum and the action hash"],
              ["packages/contracts/test/Frontrun.t.sol", "the attacks: a copied attestation cannot be reused for other terms"],
              ["apps/web/lib/use-world-enroll.ts", "the enrolment sequence, shared by both interfaces"],
            ]}
          />
        </div>
      </section>

      {/* -------------------------------------------------------- Whitechain -- */}
      <section className="ui-section">
        <div className="ui-proof-head">
          <h2 className="ui-title">Whitechain</h2>
          <SponsorMark sponsor="whitechain" />
        </div>

        <div className="ui-split">
          <div>
            <h3 className="ui-tile-title">The money, and the rules that move it</h3>
            <p className="ui-lede">
              Orders reserve a real USDT balance, and a matched invoice pays from it in the same
              transaction. The gate has no withdraw function.
            </p>
          </div>

          <div className="ui-panel">
            <div className="ui-row">
              <span className="ui-muted">Gate</span>
              {p.gate ? (
                <ProofHash value={p.gate} href={addressUrl(p.chainId, p.gate)} />
              ) : (
                <span className="ui-faint">not configured</span>
              )}
            </div>
            <div className="ui-row">
              <span className="ui-muted">USDT (6 decimals)</span>
              {p.usdt ? (
                <ProofHash value={p.usdt} href={addressUrl(p.chainId, p.usdt)} />
              ) : (
                <span className="ui-faint">not configured</span>
              )}
            </div>
            <div className="ui-row">
              <span className="ui-muted">Latest payment</span>
              {p.paid ? (
                <span style={{ display: "inline-flex", gap: 10, alignItems: "center" }}>
                  <span className="ui-mono">{usdt(p.paid.paid ?? 0n)} USDT</span>
                  <ProofHash value={p.paid.txHash} href={txUrl(p.chainId, p.paid.txHash)} />
                </span>
              ) : (
                <span className="ui-faint">{p.reachable ? "none yet" : "not confirmed"}</span>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
