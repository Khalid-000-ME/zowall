"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Person = { key: string; name: string; enrolled: boolean };

type Result = { outcome?: string; reason?: string; txHash?: string } | null;

/**
 * Approve or reject a held invoice as a named person.
 *
 * The person is sent, not assumed, because that is the whole control: the
 * contract reverts if the chosen approver is the one who raised the order or
 * the one who signed for delivery. A refusal here is the feature working, so
 * it is reported as an outcome rather than swallowed as an error.
 */
export function ResolveHold({
  holdId,
  people,
  requireVerified,
}: {
  holdId: string;
  people: Person[];
  requireVerified: boolean;
}) {
  const router = useRouter();
  const [who, setWho] = useState(people[0]?.key ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(approve: boolean) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/demo/hold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ holdId, approve, approver: who, requireVerified }),
      });
      const data = (await res.json()) as { result?: Result; error?: string };
      if (!res.ok) {
        setError(data.error ?? "The gate refused that.");
        return;
      }
      setResult(data.result ?? null);
      router.refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      <label style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
        <span className="ui-muted">Deciding as</span>
        <select
          value={who}
          onChange={(e) => setWho(e.target.value)}
          style={{
            padding: "9px 11px",
            border: "1px solid var(--border-strong)",
            borderRadius: 9,
            background: "var(--surface)",
            color: "var(--text)",
            font: "inherit",
            fontSize: 14,
          }}
        >
          {people.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
              {p.enrolled ? " (World ID)" : " (stand-in)"}
            </option>
          ))}
        </select>
      </label>

      <div className="ui-actions">
        <button
          type="button"
          onClick={() => void send(true)}
          disabled={busy || !who}
          className="ui-btn ui-btn--primary"
        >
          {busy ? "Asking the gate…" : "Approve and pay"}
        </button>
        <button
          type="button"
          onClick={() => void send(false)}
          disabled={busy || !who}
          className="ui-btn"
        >
          Reject
        </button>
      </div>

      {error ? <div className="ui-note ui-note--warn">{error}</div> : null}

      {result ? (
        <div className="ui-note">
          {result.outcome ? <strong>{result.outcome}. </strong> : null}
          {result.reason}
        </div>
      ) : null}
    </div>
  );
}
