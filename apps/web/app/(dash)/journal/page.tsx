import { Empty, Panel } from "@/components/Empty";
import { Hash } from "@/components/Hash";
import { OutcomeBadge } from "@/components/Outcome";
import { ReplayButton } from "@/components/ReplayButton";
import { getDecisions } from "@/lib/chain";
import { hashscanTopic, txUrl } from "@/lib/chains";
import { serverEnv } from "@/lib/env";
import { getJournal } from "@/lib/journal-read";

export const dynamic = "force-dynamic";

/**
 * The journal, read live from a public Hedera mirror node.
 *
 * Nothing here comes from this app's own storage, which is the point: this page
 * shows what a stranger sees running `journal replay`, and it would keep working
 * if this server were turned off. Each decision is checked against the Whitechain
 * log it describes, so a journal that drifted from the chain would show here.
 */
export default async function JournalPage() {
  const env = serverEnv();

  if (!env.hederaTopicId) {
    return (
      <>
        <h1 style={{ fontSize: 30 }}>Journal</h1>
        <Empty title="No Hedera topic configured yet. Create one, then set HEDERA_TOPIC_ID." />
      </>
    );
  }

  const [journal, decisions] = await Promise.all([
    getJournal(true),
    env.gateAddress ? getDecisions().catch(() => []) : [],
  ]);
  const chainByTx = new Map(decisions.map((d) => [d.txHash.toLowerCase(), d]));
  const records = [...journal.records].reverse();

  const topicUrl = hashscanTopic(env.hederaTopicId);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "baseline" }}>
        <h1 style={{ fontSize: 30 }}>Journal</h1>
        <a href={topicUrl} target="_blank" rel="noreferrer" className="mono" style={{ fontSize: 14 }}>
          {env.hederaTopicId} on HashScan
        </a>
      </div>
      <p style={{ color: "var(--text-muted)", maxWidth: "var(--measure)" }}>
        Every decision, in the order consensus assigned. Only this service can write to the topic, and
        it has no admin key, so it cannot be edited or deleted. Anyone can read it, including you,
        without asking us.
      </p>

      <div style={{ margin: "var(--space-5) 0" }}>
        <ReplayButton topicUrl={topicUrl} />
      </div>

      {journal.error ? (
        <Panel title="Mirror node unreachable">
          <p className="mono" style={{ margin: 0, color: "var(--rejected)" }}>
            {journal.error}
          </p>
        </Panel>
      ) : records.length === 0 ? (
        <Empty title="The topic exists but has no entries yet." />
      ) : (
        <ol style={{ listStyle: "none", padding: 0, display: "grid", gap: "var(--space-2)" }}>
          {records.map((r) => {
            const e = r.entry;
            const chain = chainByTx.get(e.evm.tx.toLowerCase());
            const agrees = chain ? chain.journalDigest.toLowerCase() === e.dig.toLowerCase() : null;

            return (
              <li
                key={r.sequenceNumber}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "var(--space-3) var(--space-4)",
                  background: "var(--surface)",
                  display: "flex",
                  gap: "var(--space-4)",
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <span className="mono" style={{ color: "var(--text-faint)", minWidth: 36 }}>
                  #{r.sequenceNumber}
                </span>
                <span style={{ fontSize: 13, minWidth: 100 }}>{e.kind.replace("_", " ")}</span>
                <span className="mono" style={{ fontSize: 12, color: "var(--text-muted)", minWidth: 48 }}>
                  po #{e.po}
                </span>

                {e.kind === "decision" ? (
                  <>
                    <OutcomeBadge outcome={e.outcome} />
                    <span className="mono" style={{ fontSize: 12 }}>
                      {e.codes.join(" ") || "clean"}
                    </span>
                  </>
                ) : null}

                <span style={{ marginLeft: "auto", display: "inline-flex", gap: 12, alignItems: "center", fontSize: 13 }}>
                  <Hash value={e.evm.tx} href={txUrl(e.evm.chain, e.evm.tx)} />
                  {e.kind === "decision" ? (
                    agrees === null ? (
                      <span style={{ color: "var(--text-faint)" }}>no chain record</span>
                    ) : agrees ? (
                      <span style={{ color: "var(--paid)" }}>matches Whitechain</span>
                    ) : (
                      <span style={{ color: "var(--rejected)" }}>DIFFERS from Whitechain</span>
                    )
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
