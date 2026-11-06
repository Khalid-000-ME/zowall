"use client";

import { useState } from "react";

import { ReplayView, type Replay } from "@/components/ReplayView";

/** Runs the same reconciliation the command line does, on the server, on demand. */
export function ReplayButton({ topicUrl }: { topicUrl: string | null }) {
  const [report, setReport] = useState<Replay | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/replay", { method: "POST" });
      const data = (await res.json()) as { ok: boolean; report: Replay | null; error?: string };
      if (!data.ok || !data.report) setError(data.error ?? "the replay could not run");
      else setReport(data.report);
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        disabled={running}
        style={{
          background: "var(--accent)",
          color: "var(--accent-text)",
          border: "none",
          borderRadius: "var(--radius-sm)",
          padding: "9px 16px",
          fontSize: 14,
          cursor: running ? "wait" : "pointer",
          opacity: running ? 0.7 : 1,
        }}
      >
        {running ? "Recomputing…" : "Verify against Whitechain"}
      </button>
      {error ? <p style={{ color: "var(--rejected)", fontSize: 14 }}>{error}</p> : null}
      {report ? <ReplayView replay={report} topicUrl={topicUrl} /> : null}
    </div>
  );
}
