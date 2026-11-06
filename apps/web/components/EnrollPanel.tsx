"use client";

import { IDKitRequestWidget, proofOfHuman } from "@worldcoin/idkit";
import type { IDKitResult, RpContext } from "@worldcoin/idkit";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Hash } from "@/components/Hash";

type Config = {
  configured: boolean;
  missing?: string[];
  app_id?: `app_${string}`;
  action?: string;
  environment?: "staging" | "production" | "sandbox";
  rp_context?: RpContext;
};

type Person = { label: string; personId: string; enrolledAt: number };

type Outcome =
  | { kind: "enrolled"; label: string; personId: string; already: boolean }
  | { kind: "recognised" }
  | { kind: "error"; message: string };

/**
 * Enrolment: one World ID uniqueness proof per person.
 *
 * What comes back is a nullifier, and that becomes the person's stable personId.
 * It is what the contract later compares to decide that the person who raised an
 * order and the person who signed for the delivery are different people. Nothing
 * else about them is asked for or kept: no name from World, no age, no document.
 *
 * Two rules carried over from the earlier project, both learned the hard way:
 * a fresh signed request is fetched every time the widget opens, because its nonce
 * is single-use and reusing one is rejected as `duplicate_nonce`; and
 * `nullifier_replayed` is not a failure, it is World recognising a person it has
 * already verified for this action.
 */
export function EnrollPanel() {
  const [config, setConfig] = useState<Config | null>(null);
  const [session, setSession] = useState<Config | null>(null);
  const [open, setOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [people, setPeople] = useState<Person[]>([]);

  const loadPeople = useCallback(async () => {
    try {
      const res = await fetch("/api/world/people", { cache: "no-store" });
      const data = (await res.json()) as { ok: boolean; people: Person[] };
      if (data.ok) setPeople(data.people);
    } catch {
      // the list is a convenience; enrolment does not depend on it
    }
  }, []);

  useEffect(() => {
    // The probe only asks whether World is configured, so it burns no nonce.
    void fetch("/api/world/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((c: Config) => setConfig(c))
      .catch(() => setConfig({ configured: false, missing: ["the server"] }));
    void loadPeople();
  }, [loadPeople]);

  async function begin() {
    setPreparing(true);
    setOutcome(null);
    try {
      const res = await fetch("/api/world/config?sign=1", { cache: "no-store" });
      const signed = (await res.json()) as Config;
      if (!signed.configured || !signed.rp_context || !signed.app_id || signed.action === undefined) {
        setOutcome({
          kind: "error",
          message: `Could not build a World request${
            signed.missing?.length ? `: missing ${signed.missing.join(", ")}` : "."
          }`,
        });
        return;
      }
      setSession(signed);
      setOpen(true);
    } finally {
      setPreparing(false);
    }
  }

  async function finish(proof: IDKitResult) {
    setSaving(true);
    try {
      // Sent as received. The server validates it with World and is the only thing
      // that can turn it into a personId.
      const res = await fetch("/api/world/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proof, label: name }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        personId?: string;
        label?: string;
        alreadyEnrolled?: boolean;
        detail?: string;
      };
      if (data.ok && data.personId) {
        setOutcome({
          kind: "enrolled",
          label: data.label ?? name,
          personId: data.personId,
          already: Boolean(data.alreadyEnrolled),
        });
        void loadPeople();
      } else {
        setOutcome({ kind: "error", message: data.detail ?? "The server could not verify that proof." });
      }
    } catch (err) {
      setOutcome({ kind: "error", message: String(err) });
    } finally {
      setSaving(false);
    }
  }

  const box: React.CSSProperties = {
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    background: "var(--surface)",
    padding: "var(--space-5)",
  };

  return (
    <div style={{ display: "grid", gap: "var(--space-5)", maxWidth: 720 }}>
      <section style={box}>
        <h2 style={{ fontSize: 22, marginBottom: "var(--space-3)" }}>Verify a person</h2>

        {!config ? (
          <p style={{ color: "var(--text-muted)", margin: 0 }}>Checking the World configuration…</p>
        ) : !config.configured ? (
          <p style={{ color: "var(--held)", margin: 0 }}>
            World ID is not configured on this server. Missing: {(config.missing ?? []).join(", ")}.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "var(--space-3)" }}>
            <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
              <span style={{ color: "var(--text-muted)" }}>Name to show in the app</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Priya"
                maxLength={40}
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

            <div>
              <button
                type="button"
                onClick={begin}
                disabled={preparing || saving || name.trim() === ""}
                style={{
                  background: "var(--accent)",
                  color: "var(--accent-text)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  padding: "11px 20px",
                  fontSize: 15,
                  cursor: preparing || saving ? "wait" : "pointer",
                  opacity: preparing || saving || name.trim() === "" ? 0.55 : 1,
                }}
              >
                {preparing ? "Preparing…" : saving ? "Checking the proof…" : "Verify with World ID"}
              </button>
            </div>

            {config.environment === "sandbox" ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
                This server is in <strong>sandbox</strong> mode. Approve with the World ID (Sandbox) app.
                The production World App will not accept this request.
              </p>
            ) : config.environment === "staging" ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
                This server is in <strong>staging</strong> mode. In the dialog, choose
                &ldquo;Use the simulator&rdquo; to approve with a test identity. The production World App
                will not accept this request.
              </p>
            ) : null}

            {session?.rp_context && session.app_id && session.action !== undefined ? (
              <IDKitRequestWidget
                key={session.rp_context.nonce}
                open={open}
                onOpenChange={(next) => {
                  setOpen(next);
                  // Drop the spent request when the modal closes so the next attempt
                  // is forced to fetch a new nonce.
                  if (!next) setSession(null);
                }}
                app_id={session.app_id}
                action={session.action}
                rp_context={session.rp_context}
                allow_legacy_proofs
                environment={session.environment ?? "production"}
                preset={proofOfHuman()}
                onSuccess={(result) => {
                  setOpen(false);
                  setSession(null);
                  void finish(result);
                }}
                onError={(code) => {
                  setOpen(false);
                  setSession(null);
                  if (code === "nullifier_replayed") {
                    setOutcome({ kind: "recognised" });
                    return;
                  }
                  setOutcome({
                    kind: "error",
                    message:
                      code === "duplicate_nonce"
                        ? "That request was already used. Try again: a fresh one will be issued."
                        : `World verification did not complete: ${code}`,
                  });
                }}
              />
            ) : null}
          </div>
        )}

        {outcome?.kind === "enrolled" ? (
          <div
            style={{
              marginTop: "var(--space-4)",
              padding: "var(--space-3) var(--space-4)",
              borderRadius: "var(--radius-sm)",
              background: "var(--paid-bg)",
              color: "var(--paid)",
            }}
          >
            <strong>
              {outcome.already ? `${outcome.label} was already verified` : `${outcome.label} is verified`}
            </strong>
            <div style={{ marginTop: 4, fontSize: 13 }}>
              personId <span className="mono">{outcome.personId.slice(0, 18)}…</span>. They can now act as
              creator, receiver or approver in the{" "}
              <Link href="/walkthrough" style={{ color: "inherit" }}>
                walkthrough
              </Link>
              .
            </div>
          </div>
        ) : null}

        {outcome?.kind === "recognised" ? (
          <div
            style={{
              marginTop: "var(--space-4)",
              padding: "var(--space-3) var(--space-4)",
              borderRadius: "var(--radius-sm)",
              background: "var(--held-bg)",
              color: "var(--held)",
              fontSize: 14,
            }}
          >
            World already knows this person for this action, so it will not issue a second proof. That
            refusal is the one-person-once guarantee working. If they enrolled before they are in the
            list below. Otherwise use a different World identity.
          </div>
        ) : null}

        {outcome?.kind === "error" ? (
          <p style={{ color: "var(--rejected)", marginBottom: 0 }}>{outcome.message}</p>
        ) : null}
      </section>

      <section style={box}>
        <h2 style={{ fontSize: 22, marginBottom: "var(--space-3)" }}>Verified so far</h2>
        {people.length === 0 ? (
          <p style={{ color: "var(--text-muted)", margin: 0 }}>
            Nobody yet. The walkthrough uses labelled stand-ins until people verify here.
          </p>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-2)" }}>
            {people.map((p) => (
              <li
                key={p.personId}
                style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}
              >
                <strong>{p.label}</strong>
                <Hash value={p.personId} label={`${p.personId.slice(0, 10)}…${p.personId.slice(-6)}`} />
                <span style={{ color: "var(--text-faint)", fontSize: 12 }}>
                  {new Date(p.enrolledAt).toISOString().slice(0, 16).replace("T", " ")} UTC
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ ...box, background: "var(--surface-sunken)" }}>
        <h3 style={{ fontFamily: "var(--font-body)", fontSize: 15, marginBottom: "var(--space-2)" }}>
          What is asked for, and why only that
        </h3>
        <p style={{ margin: 0, fontSize: 14, color: "var(--text-muted)", lineHeight: 1.6 }}>
          Uniqueness, and nothing else: not a name, an age or a document. The control only has to
          know that the person who raised an order and the person who signed for the delivery are
          different people, and a per-action pseudonym is the least that proves it. World guarantees
          one person gets one pseudonym, which is what stops a single person playing two roles by
          making a second account. The proof is checked on the server against World, and only the
          server can turn it into an identity the contract will accept.
        </p>
      </section>
    </div>
  );
}
