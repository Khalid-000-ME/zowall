"use client";

import { useActionState, useRef, useState } from "react";

import { registerEndpointAction, type EndpointState } from "@/app/app/actions";
import { ASSETS, assetOf } from "@/lib/amounts";

/** A working endpoint on this site for each asset, to register without writing one first. */
export type Sample = { url: string; payTo: string; price: string };
export type Samples = Record<string, Sample | undefined>;

const input: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid var(--border-strong)",
  borderRadius: 9,
  background: "var(--surface)",
  color: "var(--text)",
  font: "inherit",
  fontSize: 14,
  width: "100%",
};

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
      <span className="ui-muted">{label}</span>
      {children}
      {hint ? <span className="ui-faint" style={{ fontSize: 12.5 }}>{hint}</span> : null}
    </label>
  );
}

/**
 * Register an endpoint. It is saved either way, and verified only if the endpoint's
 * own 402 matches what is entered here: the same payee, the same price.
 */
export function EndpointForm({ samples }: { samples: Samples }) {
  const [state, action, pending] = useActionState<EndpointState, FormData>(registerEndpointAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [asset, setAsset] = useState<string>(ASSETS[0].id);
  const [fields, setFields] = useState({ name: "", url: "", price: "", payTo: "" });
  const chosen = assetOf(asset) ?? ASSETS[0];
  const sample = samples[chosen.id];
  const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form
      ref={formRef}
      action={action}
      className="ui-panel"
      style={{ display: "grid", gap: "var(--space-4)" }}
      onSubmit={() => undefined}
    >
      <div>
        <h3 className="ui-tile-title">Register an x402 endpoint</h3>
        <p className="ui-tile-body" style={{ marginTop: 6 }}>
          We call it once, with no payment, and check that its own 402 names this payee and this price.
        </p>
      </div>

      <Field label="Name">
        <input name="name" placeholder="Weather forecast" maxLength={80} required style={input} value={fields.name} onChange={set("name")} />
      </Field>

      <Field label="Endpoint URL" hint="The URL that answers 402 Payment Required.">
        <input name="url" type="url" placeholder="https://api.example.com/forecast" required style={input} value={fields.url} onChange={set("url")} />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
        <Field label="Price per call">
          <input name="price" inputMode="decimal" placeholder={chosen.symbol === "HBAR" ? "0.0001" : "0.10"} required style={input} value={fields.price} onChange={set("price")} />
        </Field>
        <Field label="Asset">
          <select name="asset" value={asset} onChange={(e) => setAsset(e.target.value)} style={input}>
            {ASSETS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.symbol}
                {a.network.startsWith("eip155") ? " (Whitechain)" : " (Hedera)"}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Paid to" hint={`The ${chosen.payee} the endpoint's quote pays, such as ${chosen.example}.`}>
        <input name="payTo" placeholder={chosen.example} required style={input} value={fields.payTo} onChange={set("payTo")} />
      </Field>

      {sample ? (
        <div>
          <button
            type="button"
            className="ui-btn"
            onClick={() =>
              setFields((f) => ({ name: f.name || `Sample ${chosen.symbol} endpoint`, url: sample.url, price: sample.price, payTo: sample.payTo }))
            }
          >
            Fill in a sample {chosen.symbol} endpoint
          </button>
          <span className="ui-faint" style={{ fontSize: 12.5, marginLeft: 10 }}>
            Runs on this site, so it verifies.
          </span>
        </div>
      ) : null}

      <Field label="Description">
        <textarea name="description" rows={2} maxLength={280} placeholder="What a call returns" style={{ ...input, resize: "vertical" }} />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
        <Field label="Tags" hint="Comma separated.">
          <input name="tags" placeholder="weather, data" style={input} />
        </Field>
        <Field label="Listing">
          <select name="visibility" defaultValue="public" style={input}>
            <option value="public">Public registry</option>
            <option value="private">Private, only I can see it</option>
          </select>
        </Field>
      </div>

      {state.error ? <div className="ui-note ui-note--warn">{state.error}</div> : null}

      {state.ok ? (
        state.ok.status === "verified" ? (
          <div className="ui-note">
            <strong>{state.ok.name}</strong> is verified and listed.
          </div>
        ) : (
          <div className="ui-note ui-note--warn">
            <strong>{state.ok.name}</strong> was saved but could not be verified:
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {state.ok.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        )
      ) : null}

      <div className="ui-actions">
        <button type="submit" className="ui-btn ui-btn--primary" disabled={pending}>
          {pending ? "Calling your endpoint…" : "Register and verify"}
        </button>
      </div>
    </form>
  );
}
