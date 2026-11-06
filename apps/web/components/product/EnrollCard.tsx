"use client";

import { IDKitRequestWidget, proofOfHuman } from "@worldcoin/idkit";
import { useState } from "react";

import { useWorldEnroll } from "@/lib/use-world-enroll";

const ENV_HINT: Record<string, string> = {
  sandbox: "Approve with the World ID (Sandbox) app. The production World App will not accept this request.",
  staging: 'Choose "Use the simulator" in the dialog. The production World App will not accept this request.',
};

/**
 * Verify one person with World ID.
 *
 * The proof never becomes an identity in the browser: it is posted to the
 * server, checked with World there, and only the server turns the nullifier
 * into the personId the contract compares. The widget below is a way to
 * collect a proof, not a way to claim one.
 */
export function EnrollCard({ roleHint }: { roleHint?: string }) {
  const [name, setName] = useState("");
  const w = useWorldEnroll();

  if (!w.config) {
    return <div className="ui-panel ui-muted">Checking the World configuration…</div>;
  }

  if (!w.config.configured) {
    return (
      <div className="ui-note ui-note--warn">
        World ID is not configured on this server. Missing: {(w.config.missing ?? []).join(", ")}.
      </div>
    );
  }

  const hint = w.config.environment ? ENV_HINT[w.config.environment] : undefined;
  const busy = w.preparing || w.saving;

  return (
    <div className="ui-panel">
      <h3 className="ui-tile-title">Verify a person</h3>
      <p className="ui-tile-body" style={{ marginTop: 6 }}>
        {roleHint ?? "World ID proves this is a distinct human. Nothing else is asked for or kept."}
      </p>

      <div style={{ display: "grid", gap: "var(--space-3)", marginTop: "var(--space-4)" }}>
        <label style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
          <span className="ui-muted">Name to show in the workspace</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Priya"
            maxLength={40}
            spellCheck={false}
            style={{
              padding: "9px 11px",
              border: "1px solid var(--border-strong)",
              borderRadius: 9,
              background: "var(--surface)",
              color: "var(--text)",
              font: "inherit",
              fontSize: 14,
            }}
          />
        </label>

        <div className="ui-actions">
          <button
            type="button"
            onClick={() => void w.begin()}
            disabled={busy || name.trim() === ""}
            className="ui-btn ui-btn--primary"
          >
            {w.preparing ? "Preparing…" : w.saving ? "Checking the proof…" : "Verify with World ID"}
          </button>
          {hint ? <span className="ui-faint" style={{ fontSize: 12.5 }}>{hint}</span> : null}
        </div>

        {w.session?.rp_context && w.session.app_id && w.session.action !== undefined ? (
          <IDKitRequestWidget
            key={w.session.rp_context.nonce}
            open={w.open}
            onOpenChange={w.closeWidget}
            app_id={w.session.app_id}
            action={w.session.action}
            rp_context={w.session.rp_context}
            allow_legacy_proofs
            environment={w.session.environment ?? "production"}
            preset={proofOfHuman()}
            onSuccess={(result) => {
              w.closeWidget(false);
              void w.finish(result, name);
            }}
            onError={(code) => w.failWidget(code)}
          />
        ) : null}

        {w.outcome?.kind === "enrolled" ? (
          <div className="ui-note">
            <strong>{w.outcome.label}</strong>{" "}
            {w.outcome.already ? "was already verified" : "is verified"}.{" "}
            <span className="ui-mono ui-faint">{w.outcome.personId.slice(0, 18)}…</span>
          </div>
        ) : null}

        {w.outcome?.kind === "recognised" ? (
          <div className="ui-note">
            World already knows this person for this action, so it will not issue a second proof.
            That refusal is the uniqueness guarantee working. Verify a different person instead.
          </div>
        ) : null}

        {w.outcome?.kind === "error" ? (
          <div className="ui-note ui-note--warn">{w.outcome.message}</div>
        ) : null}
      </div>
    </div>
  );
}
