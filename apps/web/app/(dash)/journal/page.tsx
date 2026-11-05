import { decodeTopic, hashscanTopicUrl, readTopic } from "@zowall/journal";

import { Empty, Panel } from "@/components/Empty";
import { serverEnv } from "@/lib/env";

/**
 * The journal, read live from a public Hedera mirror node.
 *
 * Nothing here comes from our own database, which is the point: this page is
 * showing the same thing a stranger sees running `journal replay`, and it
 * would keep working if our server were turned off.
 */
export const dynamic = "force-dynamic";

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

  let records: ReturnType<typeof decodeTopic>["records"] = [];
  let error: string | null = null;

  try {
    const messages = await readTopic(env.hederaTopicId, { order: "desc", limit: 50 });
    records = decodeTopic(messages).records;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontSize: 30 }}>Journal</h1>
        <a
          href={hashscanTopicUrl(env.hederaTopicId)}
          target="_blank"
          rel="noreferrer"
          className="mono"
          style={{ fontSize: 14 }}
        >
          {env.hederaTopicId} on HashScan
        </a>
      </div>
      <p style={{ color: "var(--text-muted)", maxWidth: "var(--measure)" }}>
        Every decision, in the order consensus assigned. Only this service can write to the topic.
        Anyone can read it, including you, without asking us.
      </p>

      {error ? (
        <Panel title="Mirror node unreachable">
          <p className="mono" style={{ margin: 0, color: "var(--rejected)" }}>
            {error}
          </p>
        </Panel>
      ) : records.length === 0 ? (
        <Empty title="The topic exists but has no entries yet." />
      ) : (
        <ol style={{ listStyle: "none", padding: 0, display: "grid", gap: "var(--space-2)" }}>
          {records.map((r) => (
            <li
              key={r.sequenceNumber}
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: "var(--space-3)",
                background: "var(--surface)",
                display: "flex",
                gap: "var(--space-3)",
                flexWrap: "wrap",
                alignItems: "baseline",
              }}
            >
              <span className="mono" style={{ color: "var(--text-faint)" }}>
                #{r.sequenceNumber}
              </span>
              <strong style={{ fontSize: 13 }}>{r.entry.kind}</strong>
              <span className="mono" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                po #{r.entry.po}
              </span>
              {r.entry.kind === "decision" ? (
                <span className="mono" style={{ fontSize: 12 }}>
                  {r.entry.outcome} {r.entry.codes.join(" ")}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
