"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Human = { key: string; name: string; enrolled: boolean };

/**
 * Raising an order is the Creator role. The server relays the transaction, and
 * what authorises it is an attestation for the chosen person, so that person's
 * id is recorded on the order and can never later be the receiver or approver.
 */
export function NewPOForm() {
  const router = useRouter();
  const [people, setPeople] = useState<Human[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [creator, setCreator] = useState("alice");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const form = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;

    try {
      const res = await fetch("/api/demo/po", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, creator }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        result?: { poId?: string };
      };
      if (!data.ok || !data.result?.poId) {
        setError(data.error ?? "could not raise the purchase order");
        return;
      }
      router.push(`/match/${data.result.poId}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "var(--space-4)" }}>
      {!enabled ? (
        <p style={{ color: "var(--held)", margin: 0, fontSize: 14 }}>
          The demo executor is off on this deployment, so orders cannot be raised from here.
        </p>
      ) : null}

      <Row label="What is being bought" name="description" placeholder="2 monitors" defaultValue="2 monitors" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
        <Row label="Quantity (1 to 20)" name="qty" placeholder="2" defaultValue="2" />
        <Row label="Unit price, USDT (up to 5)" name="unitPrice" placeholder="1.00" defaultValue="1" />
      </div>

      <Row label="Price tolerance, %" name="tolerancePct" placeholder="5" defaultValue="5" />

      <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
        <span style={{ color: "var(--text-muted)" }}>Raised by</span>
        <select
          value={creator}
          onChange={(e) => setCreator(e.target.value)}
          style={inputStyle}
        >
          {people.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name}
              {p.enrolled ? " (World ID)" : " (stand-in)"}
            </option>
          ))}
        </select>
      </label>

      {error ? <p style={{ color: "var(--rejected)", margin: 0, fontSize: 14 }}>{error}</p> : null}

      <button
        type="submit"
        disabled={saving || !enabled}
        style={{
          justifySelf: "start",
          background: "var(--accent)",
          color: "var(--accent-text)",
          border: "none",
          borderRadius: "var(--radius-sm)",
          padding: "11px 20px",
          fontSize: 15,
          cursor: saving ? "wait" : "pointer",
          opacity: saving || !enabled ? 0.6 : 1,
        }}
      >
        {saving ? "Reserving funds…" : "Raise and reserve"}
      </button>
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "9px 11px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface)",
  color: "var(--text)",
  font: "inherit",
};

function Row({
  label,
  name,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  placeholder: string;
  defaultValue: string;
}) {
  return (
    <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <input
        name={name}
        placeholder={placeholder}
        defaultValue={defaultValue}
        required
        spellCheck={false}
        style={inputStyle}
      />
    </label>
  );
}
