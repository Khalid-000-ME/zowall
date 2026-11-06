"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Person = { key: string; name: string };

type Outcome = { tone: "ok" | "bad"; text: string; tx?: string } | null;

const field: React.CSSProperties = {
  padding: "9px 11px",
  border: "1px solid var(--border-strong)",
  borderRadius: 9,
  background: "var(--surface)",
  color: "var(--text)",
  font: "inherit",
  fontSize: 14,
  width: "100%",
};

async function call(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as {
    ok: boolean;
    error?: string;
    result?: { poId?: string; reverted?: { message?: string }; tx?: { hash: string } };
  };
}

/**
 * The result of a call, in words. A revert is reported as the refusal it is,
 * because "the contract said no" is the control working, not a fault.
 */
function describe(data: Awaited<ReturnType<typeof call>>, success: string): Outcome {
  if (!data.ok) return { tone: "bad", text: data.error ?? "That did not go through." };
  if (data.result?.reverted) {
    return { tone: "bad", text: data.result.reverted.message ?? "The contract refused that.", tx: data.result.tx?.hash };
  }
  return { tone: "ok", text: success, tx: data.result?.tx?.hash };
}

function Result({ outcome }: { outcome: Outcome }) {
  if (!outcome) return null;
  return (
    <div className={outcome.tone === "ok" ? "ui-note" : "ui-note ui-note--warn"}>
      {outcome.text}
      {outcome.tx ? (
        <>
          {" "}
          <a
            href={`https://explorer.testnet.whitechain.io/tx/${outcome.tx}`}
            target="_blank"
            rel="noreferrer"
            className="ui-mono"
          >
            {outcome.tx.slice(0, 10)}…{outcome.tx.slice(-6)}
          </a>
        </>
      ) : null}
    </div>
  );
}

/**
 * Raise an order as a verified person. What authorises the transaction is an
 * attestation, signed by the attestor quorum, that commits to exactly these terms.
 */
export function NewOrder({ people, enabled }: { people: Person[]; enabled: boolean }) {
  const router = useRouter();
  const [creator, setCreator] = useState(people[0]?.key ?? "");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setOutcome(null);
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      const data = await call("/api/demo/po", {
        description: f["description"],
        qty: f["qty"],
        unitPrice: f["unitPrice"],
        tolerancePct: f["tolerancePct"],
        creator,
      });
      setOutcome(describe(data, `Order #${data.result?.poId ?? ""} raised and the funds are reserved.`));
      if (data.ok && !data.result?.reverted) router.refresh();
    } catch (err) {
      setOutcome({ tone: "bad", text: String(err) });
    } finally {
      setBusy(false);
    }
  }

  const blocked = !enabled || people.length === 0;

  return (
    <form onSubmit={submit} className="ui-panel" style={{ display: "grid", gap: "var(--space-4)" }}>
      <div>
        <h3 className="ui-tile-title">Raise an order</h3>
        <p className="ui-tile-body" style={{ marginTop: 6 }}>
          The funds are reserved against the vault the moment it is raised. The person raising it can
          never also sign for the delivery or approve an exception on it.
        </p>
      </div>

      {people.length === 0 ? (
        <div className="ui-note ui-note--warn">Nobody has verified with World ID yet.</div>
      ) : null}
      {!enabled ? (
        <div className="ui-note ui-note--warn">The demo executor is switched off on this server.</div>
      ) : null}

      <label style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
        <span className="ui-muted">What is being ordered</span>
        <input name="description" defaultValue="4 monitors" maxLength={120} style={field} required />
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "var(--space-3)" }}>
        <label style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
          <span className="ui-muted">Quantity</span>
          <input name="qty" type="number" min={1} defaultValue={4} style={field} required />
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
          <span className="ui-muted">Unit price, USDT</span>
          <input name="unitPrice" defaultValue="1.00" inputMode="decimal" style={field} required />
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
          <span className="ui-muted">Price tolerance, %</span>
          <input name="tolerancePct" type="number" min={0} max={20} step="0.5" defaultValue={5} style={field} required />
        </label>
      </div>

      <label style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
        <span className="ui-muted">Raised by</span>
        <select value={creator} onChange={(e) => setCreator(e.target.value)} style={field}>
          {people.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name} (World ID)
            </option>
          ))}
        </select>
      </label>

      <div className="ui-actions">
        <button type="submit" className="ui-btn ui-btn--primary" disabled={busy || blocked}>
          {busy ? "Reserving funds…" : "Raise the order"}
        </button>
      </div>
      <Result outcome={outcome} />
    </form>
  );
}

/** Sign for a delivery on one order, as a person other than whoever raised it. */
export function SignDelivery({
  poId,
  remaining,
  people,
  enabled,
}: {
  poId: string;
  remaining: number;
  people: Person[];
  enabled: boolean;
}) {
  const router = useRouter();
  const [who, setWho] = useState(people[1]?.key ?? people[0]?.key ?? "");
  const [qty, setQty] = useState(String(Math.max(1, remaining)));
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);

  async function sign() {
    setBusy(true);
    setOutcome(null);
    try {
      const data = await call("/api/demo/receipt", { poId, qty, receiver: who });
      setOutcome(describe(data, `Signed for ${qty}.`));
      if (data.ok && !data.result?.reverted) router.refresh();
    } catch (err) {
      setOutcome({ tone: "bad", text: String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "end" }}>
        <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
          <span className="ui-muted">Signed for by</span>
          <select value={who} onChange={(e) => setWho(e.target.value)} style={{ ...field, width: "auto" }}>
            {people.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 12.5 }}>
          <span className="ui-muted">Units</span>
          <input
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            inputMode="numeric"
            style={{ ...field, width: 90 }}
          />
        </label>
        <button type="button" className="ui-btn" onClick={() => void sign()} disabled={busy || !enabled || !who}>
          {busy ? "Signing…" : "Sign for delivery"}
        </button>
      </div>
      <Result outcome={outcome} />
    </div>
  );
}
