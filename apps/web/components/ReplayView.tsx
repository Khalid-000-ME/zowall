export type ReplayFinding = {
  kind: string;
  seq: number;
  detail?: string;
  field?: string;
  reason?: string;
};

export type Replay = {
  ok: boolean;
  entries: number;
  decisions: number;
  findings: ReplayFinding[];
};

/**
 * The result of recomputing every journalled decision from the chain's own logs.
 * Shared by the walkthrough and the journal page so they cannot describe the same
 * check differently.
 */
export function ReplayView({ replay, topicUrl }: { replay: Replay; topicUrl: string | null }) {
  return (
    <div
      style={{
        marginTop: "var(--space-4)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        background: "var(--surface-sunken)",
        padding: "var(--space-4)",
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <strong style={{ color: replay.ok ? "var(--paid)" : "var(--rejected)", fontSize: 18 }}>
          {replay.ok ? "Journal and chain agree" : "Mismatch found"}
        </strong>
        <span style={{ color: "var(--text-muted)", fontSize: 14 }}>
          {replay.entries} entries, {replay.decisions} decisions recomputed
        </span>
        {topicUrl ? (
          <a href={topicUrl} target="_blank" rel="noreferrer" style={{ fontSize: 14 }}>
            open on HashScan
          </a>
        ) : null}
      </div>
      <ul style={{ listStyle: "none", margin: "var(--space-3) 0 0", padding: 0, display: "grid", gap: 4 }}>
        {replay.findings.map((f, i) => (
          <li key={`${f.seq}-${i}`} className="mono" style={{ fontSize: 12 }}>
            <span style={{ color: f.kind === "ok" ? "var(--paid)" : "var(--rejected)" }}>
              {f.kind === "ok" ? "OK  " : "FAIL"}
            </span>{" "}
            #{f.seq} {f.detail ?? f.field ?? f.reason ?? f.kind}
          </li>
        ))}
      </ul>
    </div>
  );
}
