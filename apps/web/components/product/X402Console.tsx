"use client";

import { useState } from "react";

type Scenario = { id: string; title: string; blurb: string; expect: string };

type Result = {
  scenario: string;
  target: string;
  quote: { payTo: string; maxAmountRequired: string; resource: string; network: string } | null;
  outcome: "PAID" | "HELD" | "REJECTED" | "NO_QUOTE";
  codes: string[];
  reason: string;
  signed: boolean;
  mandateId: string | null;
  status: number;
  settled: boolean;
};

const CHIP: Record<string, string> = {
  PAID: "ui-chip ui-chip--ok",
  HELD: "ui-chip ui-chip--held",
  REJECTED: "ui-chip ui-chip--bad",
  NO_QUOTE: "ui-chip",
};

/**
 * Run the middleware against a live 402 and show what it did.
 *
 * The line that matters is "wallet asked to sign": a refusal that still
 * reached the wallet would be theatre. Everything else on this panel is
 * context for that one fact.
 */
export function X402Console({ scenarios }: { scenarios: Scenario[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(id: string) {
    setBusy(id);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/x402/guarded", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario: id }),
      });
      const data = (await res.json()) as { ok: boolean; result?: Result; error?: string };
      if (!data.ok || !data.result) {
        setError(data.error ?? "The run did not complete.");
        return;
      }
      setResult(data.result);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-5)" }}>
      <ul className="ui-numlist">
        {scenarios.map((s, i) => (
          <li key={s.id} className="ui-numrow">
            <span className="ui-numrow-n">{String(i + 1).padStart(2, "0")}</span>
            <span className="ui-numrow-label">{s.title}</span>
            <span className="ui-numrow-note">
              <button
                type="button"
                className="ui-btn"
                disabled={busy !== null}
                onClick={() => void run(s.id)}
              >
                {busy === s.id ? "Running…" : "Run"}
              </button>
            </span>
            <span className="ui-numrow-sub">
              {s.blurb} <span className="ui-faint">Expect: {s.expect}</span>
            </span>
          </li>
        ))}
      </ul>

      {error ? <div className="ui-note ui-note--warn">{error}</div> : null}

      {result ? (
        <div className="ui-panel">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "var(--space-4)",
              flexWrap: "wrap",
            }}
          >
            <h3 className="ui-tile-title">What the middleware did</h3>
            <span className={CHIP[result.outcome] ?? "ui-chip"}>
              <span className="ui-dot" />
              {result.outcome}
            </span>
          </div>

          <div className="ui-row" style={{ marginTop: "var(--space-4)" }}>
            <span className="ui-muted">Wallet asked to sign</span>
            <span className={result.signed ? "ui-chip ui-chip--ok" : "ui-chip ui-chip--bad"}>
              {result.signed ? "yes" : "no — the payment never happened"}
            </span>
          </div>

          <div className="ui-row">
            <span className="ui-muted">Mandate</span>
            <span className="ui-mono">
              {result.mandateId ? `order #${result.mandateId}` : "none covers this resource"}
            </span>
          </div>

          {result.quote ? (
            <>
              <div className="ui-row">
                <span className="ui-muted">Quoted price</span>
                <span className="ui-mono">
                  {result.quote.maxAmountRequired} atomic · {result.quote.network}
                </span>
              </div>
              <div className="ui-row">
                <span className="ui-muted">Quoted payee</span>
                <span className="ui-mono">{result.quote.payTo}</span>
              </div>
            </>
          ) : null}

          <div className="ui-row">
            <span className="ui-muted">Reason codes</span>
            <span>
              {result.codes.length === 0 ? (
                <span className="ui-chip ui-chip--ok">clean</span>
              ) : (
                <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                  {result.codes.map((c) => (
                    <span key={c} className="ui-chip ui-chip--bad ui-mono">
                      {c}
                    </span>
                  ))}
                </span>
              )}
            </span>
          </div>

          <p className="ui-tile-body" style={{ marginTop: "var(--space-4)" }}>
            {result.reason}
          </p>

          <pre className="ui-code" style={{ marginTop: "var(--space-4)" }}>
            {`GET ${result.target}
-> ${result.status}${result.settled ? "  (settlement reported)" : ""}`}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
