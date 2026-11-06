"use client";

import { useState } from "react";

type Report = { ok: boolean; entries: number; decisions: number; findings: unknown[] };

/**
 * Runs the same reconciliation the command line does, on demand: every entry
 * is pulled from the Hedera topic and each decision's digest is recomputed from
 * the Whitechain log. It is the one proof on this page that is a computation
 * rather than a lookup, so it gets a button instead of a number.
 */
export function ProofReplay() {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/replay", { method: "POST" });
      const data = (await res.json()) as { ok: boolean; report: Report | null; error?: string };
      if (!data.ok || !data.report) setError(data.error ?? "The replay could not run.");
      else setReport(data.report);
    } catch (err) {
      setError(String(err));
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      <div className="ui-actions">
        <button type="button" className="ui-btn" onClick={() => void run()} disabled={running}>
          {running ? "Recomputing from both chains…" : "Run the replay"}
        </button>
      </div>

      {error ? <div className="ui-note ui-note--warn">{error}</div> : null}

      {report ? (
        <div className={report.ok ? "ui-note" : "ui-note ui-note--warn"}>
          <strong>{report.ok ? "Journal and chain agree." : "Mismatch found."}</strong>{" "}
          {report.entries} entries on the topic, {report.decisions} decisions recomputed
          {report.ok ? "" : `, ${report.findings.length} finding${report.findings.length === 1 ? "" : "s"}`}.
        </div>
      ) : null}
    </div>
  );
}
