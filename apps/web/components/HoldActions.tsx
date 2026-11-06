"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ResultCard } from "@/components/ResultCard";
import type { StepResult } from "@/lib/demo";

type Human = { key: string; name: string; enrolled: boolean; personId: string };

/**
 * Release or refuse a hold as a chosen person. Pick the person who raised the
 * order, or the one who signed for the delivery, and the contract says no. Pick
 * anyone else and it goes through. The server only relays the transaction: what
 * authorises it is the attestation, and what refuses it is the contract.
 */
export function HoldActions({ holdId, topicUrl }: { holdId: string; topicUrl: string | null }) {
  const router = useRouter();
  const [people, setPeople] = useState<Human[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [who, setWho] = useState("cara");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StepResult | null>(null);

  useEffect(() => {
    void fetch("/api/demo/state")
      .then((r) => r.json())
      .then((d: { ok: boolean; enabled: boolean; humans: Human[] }) => {
        if (d.ok) {
          setPeople(d.humans);
          setEnabled(d.enabled);
        }
      })
      .catch(() => undefined);
  }, []);

  const names = Object.fromEntries(people.map((p) => [p.personId.toLowerCase(), p.name]));

  async function resolve(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/demo/hold", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ holdId, approve, approver: who }),
      });
      const data = (await res.json()) as { ok: boolean; result?: StepResult; error?: string };
      if (!data.ok || !data.result) setError(data.error ?? "that did not go through");
      else {
        setResult(data.result);
        if (data.result.tx.status === "success") router.refresh();
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) return null;

  const btn = (label: string, approve: boolean, primary: boolean) => (
    <button
      type="button"
      disabled={busy}
      onClick={() => resolve(approve)}
      style={{
        background: primary ? "var(--accent)" : "transparent",
        color: primary ? "var(--accent-text)" : "var(--text)",
        border: primary ? "none" : "1px solid var(--border-strong)",
        borderRadius: "var(--radius-sm)",
        padding: "8px 14px",
        fontSize: 14,
        cursor: busy ? "wait" : "pointer",
        opacity: busy ? 0.6 : 1,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ marginTop: "var(--space-3)" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Decided by{" "}
          <select
            value={who}
            onChange={(e) => setWho(e.target.value)}
            style={{
              padding: "6px 8px",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface)",
              color: "var(--text)",
              font: "inherit",
            }}
          >
            {people.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
                {" (World ID)"}
              </option>
            ))}
          </select>
        </label>
        {btn("Approve", true, true)}
        {btn("Refuse", false, false)}
        {busy ? <span style={{ fontSize: 13, color: "var(--text-muted)" }}>waiting for the chain…</span> : null}
      </div>
      {error ? <p style={{ color: "var(--rejected)", fontSize: 14 }}>{error}</p> : null}
      {result ? <ResultCard result={result} names={names} topicUrl={topicUrl} /> : null}
    </div>
  );
}
