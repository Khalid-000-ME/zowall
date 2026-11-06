"use client";

import { useActionState, useState, useTransition } from "react";

import { createKeyAction, revokeKeyAction, type KeyState } from "@/app/app/actions";

export type KeyRow = { id: string; name: string; prefix: string; createdAt: number; lastUsedAt: number | null; revokedAt: number | null };

const when = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export function KeyManager({ keys }: { keys: KeyRow[] }) {
  const [state, action, pending] = useActionState<KeyState, FormData>(createKeyAction, {});
  const [copied, setCopied] = useState(false);
  const [revoking, start] = useTransition();

  return (
    <div style={{ display: "grid", gap: "var(--space-5)" }}>
      <form action={action} className="ui-panel" style={{ display: "grid", gap: "var(--space-3)" }}>
        <h3 className="ui-tile-title">Create a key</h3>
        <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <input
            name="name"
            placeholder="Production"
            maxLength={40}
            style={{
              flex: "1 1 220px",
              padding: "10px 12px",
              border: "1px solid var(--border-strong)",
              borderRadius: 9,
              background: "var(--surface)",
              color: "var(--text)",
              font: "inherit",
              fontSize: 14,
            }}
          />
          <button className="ui-btn ui-btn--primary" disabled={pending} type="submit">
            {pending ? "Creating…" : "Create key"}
          </button>
        </div>

        {state.error ? <div className="ui-note ui-note--warn">{state.error}</div> : null}

        {state.apiKey ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div className="ui-note">Copy this now. It is shown once, and only a hash of it is kept.</div>
            <code className="ui-code" style={{ wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
              {state.apiKey}
            </code>
            <div>
              <button
                type="button"
                className="ui-btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(state.apiKey!);
                    setCopied(true);
                  } catch {
                    // on screen either way
                  }
                }}
              >
                {copied ? "Copied" : "Copy key"}
              </button>
            </div>
          </div>
        ) : null}
      </form>

      <table className="ui-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Key</th>
            <th>Created</th>
            <th>Last used</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.id}>
              <td>{k.name}</td>
              <td className="ui-mono">{k.prefix}…</td>
              <td className="ui-muted">{when(k.createdAt)}</td>
              <td className="ui-muted">{k.lastUsedAt ? when(k.lastUsedAt) : "never"}</td>
              <td style={{ textAlign: "right" }}>
                {k.revokedAt ? (
                  <span className="ui-chip ui-chip--bad">Revoked</span>
                ) : (
                  <button
                    type="button"
                    className="ui-btn"
                    disabled={revoking}
                    onClick={() => {
                      if (confirm(`Revoke "${k.name}"? Anything using it stops working immediately.`)) {
                        start(async () => {
                          await revokeKeyAction(k.id);
                        });
                      }
                    }}
                  >
                    Revoke
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
