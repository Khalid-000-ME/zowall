"use client";

import { useActionState, useRef } from "react";

import { registerEndpointAction, type EndpointState } from "@/app/app/actions";

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
export function EndpointForm() {
  const [state, action, pending] = useActionState<EndpointState, FormData>(registerEndpointAction, {});
  const formRef = useRef<HTMLFormElement>(null);

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
        <input name="name" placeholder="Weather forecast" maxLength={80} required style={input} />
      </Field>

      <Field label="Endpoint URL" hint="The URL that answers 402 Payment Required.">
        <input name="url" type="url" placeholder="https://api.example.com/forecast" required style={input} />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
        <Field label="Price per call">
          <input name="price" inputMode="decimal" placeholder="0.0001" required style={input} />
        </Field>
        <Field label="Asset">
          <select name="asset" defaultValue="0.0.0" style={input}>
            <option value="0.0.0">HBAR</option>
            <option value="0.0.429274">USDC</option>
          </select>
        </Field>
      </div>

      <Field label="Paid to" hint="The Hedera account the endpoint's quote pays, such as 0.0.1234.">
        <input name="payTo" placeholder="0.0.1234" required style={input} />
      </Field>

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
