"use client";

import type { IDKitResult, RpContext } from "@worldcoin/idkit";
import { useCallback, useEffect, useState } from "react";

/**
 * The World ID enrolment state machine, shared by the explainer's panel and
 * the workspace's setup card.
 *
 * It lives in one place because the two surfaces must never drift on this
 * particular flow: it is the only path that turns a proof into an identity the
 * contract trusts, and a second copy of it would be a second thing to get
 * wrong. The views own their markup; this owns the sequence.
 *
 * Two rules, both learned the hard way:
 *
 *  - a fresh signed request is fetched every time the widget opens, because
 *    the nonce inside it is single-use and reusing one is rejected as
 *    `duplicate_nonce`;
 *  - `nullifier_replayed` is not a failure. It is World refusing to issue a
 *    second uniqueness proof because it already knows this human, which is the
 *    guarantee working.
 */
export type WorldConfig = {
  configured: boolean;
  missing?: string[];
  app_id?: `app_${string}`;
  action?: string;
  environment?: "staging" | "production" | "sandbox";
  rp_context?: RpContext;
};

export type EnrolledPerson = { label: string; personId: string; enrolledAt: number };

export type EnrollOutcome =
  | { kind: "enrolled"; label: string; personId: string; already: boolean }
  | { kind: "recognised" }
  | { kind: "error"; message: string };

export function useWorldEnroll() {
  const [config, setConfig] = useState<WorldConfig | null>(null);
  const [session, setSession] = useState<WorldConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<EnrollOutcome | null>(null);
  const [people, setPeople] = useState<EnrolledPerson[]>([]);

  const loadPeople = useCallback(async () => {
    try {
      const res = await fetch("/api/world/people", { cache: "no-store" });
      const data = (await res.json()) as { ok: boolean; people: EnrolledPerson[] };
      if (data.ok) setPeople(data.people);
    } catch {
      // The list is a convenience; enrolment does not depend on it.
    }
  }, []);

  useEffect(() => {
    // The probe only asks whether World is configured, so it burns no nonce.
    void fetch("/api/world/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((c: WorldConfig) => setConfig(c))
      .catch(() => setConfig({ configured: false, missing: ["the server"] }));
    void loadPeople();
  }, [loadPeople]);

  const begin = useCallback(async () => {
    setPreparing(true);
    setOutcome(null);
    try {
      const res = await fetch("/api/world/config?sign=1", { cache: "no-store" });
      const signed = (await res.json()) as WorldConfig;
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
  }, []);

  const finish = useCallback(
    async (proof: IDKitResult, label: string) => {
      setSaving(true);
      try {
        // Sent as received. The server validates it with World and is the only
        // thing that can turn it into a personId.
        const res = await fetch("/api/world/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ proof, label }),
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
            label: data.label ?? label,
            personId: data.personId,
            already: Boolean(data.alreadyEnrolled),
          });
          void loadPeople();
        } else {
          setOutcome({
            kind: "error",
            message: data.detail ?? "The server could not verify that proof.",
          });
        }
      } catch (err) {
        setOutcome({ kind: "error", message: String(err) });
      } finally {
        setSaving(false);
      }
    },
    [loadPeople],
  );

  /** Drop the spent request so the next attempt is forced to fetch a new nonce. */
  const closeWidget = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setSession(null);
  }, []);

  /** Maps an IDKit error code to an outcome. `nullifier_replayed` is not one. */
  const failWidget = useCallback((code: string) => {
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
  }, []);

  return {
    config,
    session,
    open,
    preparing,
    saving,
    outcome,
    people,
    begin,
    finish,
    closeWidget,
    failWidget,
    setOutcome,
    reloadPeople: loadPeople,
  };
}
