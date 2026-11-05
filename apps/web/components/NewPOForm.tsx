"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Raising a purchase order is the Creator role, so it needs a verified human.
 * The form collects the order; the attestation is fetched from /api/attest,
 * which only issues one for a personId that has already been enrolled through
 * a server-verified World proof.
 */
export function NewPOForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const form = new FormData(event.currentTarget);

    try {
      const res = await fetch("/api/po", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)),
      });
      const data = (await res.json()) as { ok: boolean; poId?: string; detail?: string };

      if (!data.ok) {
        setError(data.detail ?? "could not raise the purchase order");
        return;
      }
      router.push(`/match/${data.poId}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: "var(--space-4)" }}>
      <Row label="What is being bought" name="description" placeholder="100 monitors" />
      <Row label="Vendor key" name="vendor" placeholder="0x…" />
      <Row label="Pay to" name="payee" placeholder="0x…" />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
        <Row label="Quantity" name="qty" placeholder="100" />
        <Row label="Unit price (USDT)" name="unitPrice" placeholder="40" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
        <Row label="Price tolerance (%)" name="priceTolPct" placeholder="5" />
        <Row label="Valid for (days)" name="days" placeholder="30" />
      </div>

      {error ? (
        <p style={{ color: "var(--rejected)", margin: 0, fontSize: 14 }}>{error}</p>
      ) : null}

      <button
        type="submit"
        disabled={saving}
        style={{
          justifySelf: "start",
          background: "var(--accent)",
          color: "var(--accent-text)",
          border: "none",
          borderRadius: "var(--radius-sm)",
          padding: "11px 20px",
          fontSize: 15,
          cursor: saving ? "wait" : "pointer",
        }}
      >
        {saving ? "Reserving funds…" : "Raise and reserve"}
      </button>
    </form>
  );
}

function Row({
  label,
  name,
  placeholder,
}: {
  label: string;
  name: string;
  placeholder: string;
}) {
  return (
    <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <input
        name={name}
        placeholder={placeholder}
        required
        spellCheck={false}
        style={{
          padding: "9px 11px",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-sm)",
          background: "var(--surface)",
          color: "var(--text)",
          font: "inherit",
        }}
      />
    </label>
  );
}
