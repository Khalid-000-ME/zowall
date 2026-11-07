"use client";

import { IDKitRequestWidget, proofOfHuman, type IDKitResult, type RpContext } from "@worldcoin/idkit";
import { useCallback, useEffect, useState } from "react";

type Config = {
  configured: boolean;
  missing?: string[];
  app_id?: `app_${string}`;
  action?: string;
  environment?: "staging" | "production" | "sandbox";
  repeatable?: boolean;
  rp_context?: RpContext;
};

export type SignedIn = { created: boolean; apiKey?: string };

/**
 * The one button behind both sign up and sign in.
 *
 * It asks the server for a freshly signed request, opens the World ID widget, and sends
 * the proof back to the server, which decides what the proof means. A new request is
 * fetched every time the widget opens, because the nonce inside it is single-use.
 */
export function WorldAuthButton({
  label,
  details,
  disabled,
  onSignedIn,
}: {
  label: string;
  /** role and name, only when signing up */
  details?: { role: string; name: string };
  disabled?: boolean;
  onSignedIn: (r: SignedIn) => void;
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [session, setSession] = useState<Config | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"preparing" | "checking" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only asks whether World is configured, so it burns no nonce.
    void fetch("/api/world/config?kind=auth", { cache: "no-store" })
      .then((r) => r.json())
      .then((c: Config) => setConfig(c))
      .catch(() => setConfig({ configured: false, missing: ["the server"] }));
  }, []);

  const begin = useCallback(async () => {
    setBusy("preparing");
    setError(null);
    try {
      const res = await fetch("/api/world/config?kind=auth&sign=1", { cache: "no-store" });
      const signed = (await res.json()) as Config;
      if (!signed.configured || !signed.rp_context || !signed.app_id || signed.action === undefined) {
        setError(`World sign-in is not set up on this server${signed.missing?.length ? `: missing ${signed.missing.join(", ")}` : "."}`);
        return;
      }
      setSession(signed);
      setOpen(true);
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(null);
    }
  }, []);

  const finish = useCallback(
    async (proof: IDKitResult) => {
      setBusy("checking");
      try {
        const res = await fetch("/api/auth/world", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ proof, ...(details ?? {}) }),
        });
        const data = (await res.json()) as { ok: boolean; error?: string; created?: boolean; apiKey?: string };
        if (data.ok) onSignedIn({ created: Boolean(data.created), ...(data.apiKey ? { apiKey: data.apiKey } : {}) });
        else setError(data.error ?? "That did not work. Try again.");
      } catch {
        setError("Could not reach the server. Try again.");
      } finally {
        setBusy(null);
      }
    },
    [details, onSignedIn],
  );

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) setSession(null);
  };

  const unconfigured = config !== null && !config.configured;

  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      <button
        type="button"
        className="ui-btn ui-btn--primary"
        disabled={disabled || busy !== null || config === null || unconfigured}
        onClick={() => void begin()}
      >
        {busy === "preparing" ? "Preparing…" : busy === "checking" ? "Checking the proof…" : label}
      </button>

      {unconfigured ? (
        <div className="ui-note ui-note--warn">
          World sign-in is not set up on this server{config?.missing?.length ? `: missing ${config.missing.join(", ")}` : "."}
        </div>
      ) : null}

      {config?.configured && config.environment === "sandbox" ? (
        <p className="ui-faint" style={{ fontSize: 12.5, margin: 0 }}>
          Sandbox mode: approve with the World ID (Sandbox) app. The production World App will not accept this request.
        </p>
      ) : null}

      {config?.configured && config.repeatable === false ? (
        <p className="ui-faint" style={{ fontSize: 12.5, margin: 0 }}>
          This server uses the enrolment action for sign-in, which allows one verification per person. Set
          WORLD_LOGIN_ACTION to a repeatable action to sign in more than once.
        </p>
      ) : null}

      {error ? <div className="ui-note ui-note--warn">{error}</div> : null}

      {session?.rp_context && session.app_id && session.action !== undefined ? (
        <IDKitRequestWidget
          key={session.rp_context.nonce}
          open={open}
          onOpenChange={close}
          app_id={session.app_id}
          action={session.action}
          rp_context={session.rp_context}
          allow_legacy_proofs
          environment={session.environment ?? "production"}
          preset={proofOfHuman()}
          onSuccess={(result) => {
            close(false);
            void finish(result);
          }}
          onError={(code) => {
            close(false);
            setError(
              code === "nullifier_replayed"
                ? "World recognises you, but this sign-in action only allows one verification per person. Set WORLD_LOGIN_ACTION to a repeatable action."
                : code === "duplicate_nonce"
                  ? "That request was already used. Try again."
                  : `World verification did not complete: ${code}`,
            );
          }}
        />
      ) : null}
    </div>
  );
}
