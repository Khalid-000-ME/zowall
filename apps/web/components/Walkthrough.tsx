"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SAMPLE_ATTACKS } from "@zowall/agent";
import Link from "next/link";

import { Hash } from "@/components/Hash";
import { ReplayView, type Replay } from "@/components/ReplayView";
import { ResultCard } from "@/components/ResultCard";
import type { StepResult } from "@/lib/demo";

/* -------------------------------------------------------------- api types -- */

type Human = { key: string; name: string; enrolled: boolean; personId: string };

type Info = {
  enabled: boolean;
  switchedOff: boolean;
  requireVerified: boolean;
  missing: string[];
  humans: Human[];
  vault: { display: { balance: string; encumbered: string; free: string } } | null;
  current: { poId: string; qty: string; received: string; invoiced: string; holdId: string | null } | null;
};

type Run = {
  status: "idle" | "running" | "done" | "error";
  results: StepResult[];
  replay?: Replay;
  error?: string;
  ms?: number;
};

const IDLE: Run = { status: "idle", results: [] };

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T & { ok: boolean; error?: string };
  if (!data.ok) throw new Error(data.error ?? `request failed (${res.status})`);
  return data;
}

/* ---------------------------------------------------------------- content -- */

const ACTS = [
  { id: "setup", title: "Set up the order" },
  { id: "attacks", title: "Attacks the gate refuses" },
  { id: "match", title: "An invoice that matches" },
  { id: "exceptions", title: "Exceptions need a second human" },
  { id: "proof", title: "Check the record" },
] as const;

type StepId =
  | "po"
  | "receipt"
  | "inject"
  | "swapped"
  | "forged"
  | "matching"
  | "duplicate"
  | "overpriced"
  | "deny"
  | "approve"
  | "replay";

/**
 * What is being bought. The contract only multiplies a quantity by a unit price, so a
 * unit can be a monitor, an hour of compute or one metered API call. The control is
 * the same in every case: reserve first, match the document, release only when it
 * agrees. Only the nouns and the evidence of delivery differ.
 */
type Scenario = {
  label: string;
  blurb: string;
  description: string;
  qty: number;
  unitPrice: string;
  order: string;
  arrived: string;
  half: string;
  rest: string;
  base: string;
  over: string;
  limit: string;
  evidence: string;
};

const SCENARIOS: Record<"goods" | "metered", Scenario> = {
  goods: {
    label: "Goods",
    blurb: "Physical goods: the textbook three-way match.",
    description: "2 monitors",
    qty: 2,
    unitPrice: "1",
    order: "2 monitors",
    arrived: "both monitors arrived",
    half: "One of the two monitors",
    rest: "the second monitor",
    base: "1.00",
    over: "1.20",
    limit: "1.05",
    evidence: "A second person confirms both monitors arrived.",
  },
  metered: {
    label: "Metered service",
    blurb: "An agent buying metered API calls, the sort of purchase x402 prices per request.",
    description: "200 metered API calls from a data vendor",
    qty: 200,
    unitPrice: "0.01",
    order: "200 metered API calls",
    arrived: "the calls were delivered and counted",
    half: "100 of the 200 calls",
    rest: "the other 100 calls",
    base: "0.01",
    over: "0.012",
    limit: "0.0105",
    evidence:
      "A second person confirms the calls were delivered. For a metered service the evidence is a usage log, so this is where an independent check of that log belongs.",
  },
};

const STEPS: Array<{
  id: StepId;
  act: (typeof ACTS)[number]["id"];
  title: string;
  what: string | ((s: Scenario) => string);
  needs?: "po" | "hold";
}> = [
  {
    id: "po",
    act: "setup",
    title: "Raise a purchase order",
    what: (s) =>
      `The creator orders ${s.order} at ${s.base} USDT each with a 5% price tolerance. The contract reserves 2.10 USDT out of the vault before anything is delivered, so the vendor can see the money is set aside. The reservation covers the tolerance ceiling, not just the headline total, because an invoice at ${s.limit} is allowed and has to be payable.`,
  },
  {
    id: "receipt",
    act: "setup",
    title: "Sign for the delivery",
    what: (s) =>
      `${s.evidence} The contract refuses a receiver who is the person who raised the order, so a buyer cannot vouch for its own deliveries.`,
    needs: "po",
  },
  {
    id: "inject",
    act: "attacks",
    title: "A prompt-injected agent",
    what: "A vendor email says the bank details changed and tells the agent to pay a new address. The agent is deliberately gullible, with no allowlist and no spending cap. It believes the email and asks the gate to pay. There is no purchase order behind the request, so nothing moves.",
  },
  {
    id: "swapped",
    act: "attacks",
    title: "Real vendor, wrong destination",
    what: "An invoice genuinely signed by the vendor key, but with the payee changed. The signature is good. The destination is not the one on the purchase order.",
    needs: "po",
  },
  {
    id: "forged",
    act: "attacks",
    title: "A forged invoice",
    what: "Signed by someone who is not the vendor and pointed at that other address. The gate reports every rule that failed, not only the first.",
    needs: "po",
  },
  {
    id: "matching",
    act: "match",
    title: "Pay a matching invoice",
    what: (s) =>
      `${s.half}, at the agreed price, signed by the vendor key and paid to the address on the order. It settles in USDT in a single transaction.`,
    needs: "po",
  },
  {
    id: "duplicate",
    act: "match",
    title: "Send it again",
    what: "The identical invoice, a second time. The contract recorded its hash the first time, so a replay is refused and nothing is paid twice.",
    needs: "po",
  },
  {
    id: "overpriced",
    act: "exceptions",
    title: "An invoice that is over price",
    what: (s) =>
      `The vendor bills ${s.rest} at ${s.over} instead of ${s.base}, past the 5% tolerance. A soft failure parks the invoice as a hold instead of refusing it. The money stays reserved while a person decides.`,
    needs: "po",
  },
  {
    id: "deny",
    act: "exceptions",
    title: "The wrong people try to approve",
    what: "The person who raised the order and the person who signed for the delivery each try to release the hold. The contract refuses both, and the refused transactions stay on the explorer: the protected action did not happen, and anyone can check. A third attempt comes from someone who has not verified with World ID. The attestor will not vouch for them, so no attestation exists and no transaction is sent at all.",
    needs: "hold",
  },
  {
    id: "approve",
    act: "exceptions",
    title: "A third person approves",
    what: "The approver is neither of them, so the release goes through. If the invoice costs more than what is still reserved, the order is amended by the difference, drawn from unreserved balance only and recorded in the event. An override can never spend another order's money.",
    needs: "hold",
  },
  {
    id: "replay",
    act: "proof",
    title: "Replay the journal",
    what: "Pull every entry from the Hedera topic, recompute each decision's digest from the Whitechain logs with the same engine the contract mirrors, and compare. The same check runs from the command line with no credentials and no help from us.",
  },
];

/* -------------------------------------------------------------- component -- */

export function Walkthrough({ topicUrl, gate }: { topicUrl: string | null; gate: string | null }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const [poId, setPoId] = useState<string | null>(null);
  const [holdId, setHoldId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cast, setCast] = useState({ creator: "alice", receiver: "bob", approver: "cara" });
  const [text, setText] = useState(SAMPLE_ATTACKS[0]?.text ?? "");
  const [resetting, setResetting] = useState(false);
  const [strict, setStrict] = useState(false);
  const [scenarioId, setScenarioId] = useState<keyof typeof SCENARIOS>("goods");
  const [raisedQty, setRaisedQty] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/demo/state");
      const data = (await res.json()) as Info & { ok: boolean };
      if (data.ok) {
        setInfo(data);
        // Pick up where a previous run left off, unless this page already knows.
        setPoId((cur) => cur ?? data.current?.poId ?? null);
        setHoldId((cur) => cur ?? data.current?.holdId ?? null);
      }
    } catch {
      // a transient RPC failure should not blank the page
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const names = useMemo(() => {
    const out: Record<string, string> = {};
    for (const h of info?.humans ?? []) {
      out[h.personId.toLowerCase()] = `${h.name} (${h.enrolled ? "World ID" : "stand-in"})`;
    }
    return out;
  }, [info]);

  const nameOf = (key: string) => info?.humans.find((h) => h.key === key)?.name ?? key;

  // The deployment can require verification outright. The switch below can only make
  // it stricter, never looser, and the server applies the same rule either way.
  const enforce = strict || Boolean(info?.requireVerified);

  // Quantities follow the order that exists, not the scenario selected, so a refreshed
  // page or a changed selection cannot send a step the wrong amount.
  const scenario = SCENARIOS[scenarioId];
  const poQty = raisedQty ?? (info?.current ? Number(info.current.qty) : scenario.qty);
  const half = Math.max(1, Math.floor(poQty / 2));
  const unverified = info?.humans.find((h) => !h.enrolled);

  async function run(id: StepId, job: () => Promise<Partial<Run> & { result?: StepResult }>) {
    setBusy(true);
    setRuns((r) => ({ ...r, [id]: { ...(r[id] ?? IDLE), status: "running", error: undefined } }));
    const started = Date.now();
    try {
      const out = await job();
      setRuns((r) => {
        const prev = r[id] ?? IDLE;
        return {
          ...r,
          [id]: {
            ...prev,
            status: "done",
            ms: Date.now() - started,
            results: out.result ? [...prev.results, out.result] : prev.results,
            ...(out.replay ? { replay: out.replay } : {}),
          },
        };
      });
    } catch (err) {
      setRuns((r) => ({
        ...r,
        [id]: {
          ...(r[id] ?? IDLE),
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        },
      }));
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  const invoice = (id: StepId, kind: string, nonce: string, setHold = false) =>
    run(id, async () => {
      const { result } = await post<{ result: StepResult }>("/api/demo/invoice", {
        poId,
        kind,
        qty: String(half),
        nonce,
      });
      if (setHold && result.holdId) setHoldId(result.holdId);
      return { result };
    });

  const actions: Record<StepId, React.ReactNode> = {
    po: (
      <Btn
        label="Raise the order"
        disabled={busy}
        onClick={() =>
          run("po", async () => {
            const { result } = await post<{ result: StepResult }>("/api/demo/po", {
              description: scenario.description,
              qty: String(scenario.qty),
              unitPrice: scenario.unitPrice,
              tolerancePct: "5",
              creator: cast.creator,
              requireVerified: enforce,
            });
            if (result.poId) {
              setRaisedQty(scenario.qty);
              setPoId(result.poId);
              setHoldId(null);
            }
            return { result };
          })
        }
      />
    ),
    receipt: (
      <Btn
        label="Confirm delivery"
        disabled={busy || !poId}
        onClick={() =>
          run("receipt", async () => {
            const { result } = await post<{ result: StepResult }>("/api/demo/receipt", {
              poId,
              qty: String(poQty),
              receiver: cast.receiver,
              requireVerified: enforce,
            });
            return { result };
          })
        }
      />
    ),
    inject: (
      <div style={{ display: "grid", gap: 8, width: "100%" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SAMPLE_ATTACKS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setText(s.text)}
              style={chip}
            >
              {s.label}
            </button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          spellCheck={false}
          style={{
            width: "100%",
            padding: 10,
            border: "1px solid var(--border-strong)",
            borderRadius: "var(--radius-sm)",
            background: "var(--surface)",
            color: "var(--text)",
            font: "inherit",
            fontSize: 14,
          }}
        />
        <div>
          <Btn
            label="Let the agent obey"
            disabled={busy || text.trim() === ""}
            onClick={() =>
              run("inject", async () => {
                const data = await post<{ result?: StepResult; narration: string }>("/api/attack", {
                  text,
                });
                if (!data.result) throw new Error(data.narration);
                return { result: data.result };
              })
            }
          />
        </div>
      </div>
    ),
    swapped: (
      <Btn label="Submit it" disabled={busy || !poId} onClick={() => invoice("swapped", "swapped", "3")} />
    ),
    forged: (
      <Btn label="Submit it" disabled={busy || !poId} onClick={() => invoice("forged", "forged", "4")} />
    ),
    matching: (
      <Btn label="Submit the invoice" disabled={busy || !poId} onClick={() => invoice("matching", "matching", "1")} />
    ),
    duplicate: (
      <Btn
        label="Submit it again"
        disabled={
          busy ||
          !poId ||
          !(runs["matching"]?.status === "done" || Number(info?.current?.invoiced ?? 0) >= 1)
        }
        onClick={() => invoice("duplicate", "matching", "1")}
      />
    ),
    overpriced: (
      <Btn
        label="Submit the 1.20 invoice"
        disabled={busy || !poId}
        onClick={() => invoice("overpriced", "overpriced", "2", true)}
      />
    ),
    deny: (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(
          [
            [cast.creator, "raised the order"],
            [cast.receiver, "signed for the delivery"],
          ] as const
        ).map(([who, why]) => (
          <Btn
            key={`${who}-${why}`}
            label={`${nameOf(who)} tries (${why})`}
            tone="quiet"
            disabled={busy || !holdId}
            onClick={() =>
              run("deny", async () => {
                const { result } = await post<{ result: StepResult }>("/api/demo/hold", {
                  holdId,
                  approve: true,
                  approver: who,
                });
                return { result };
              })
            }
          />
        ))}
        {unverified ? (
          <Btn
            label={`${unverified.name} tries (has not verified)`}
            tone="quiet"
            disabled={busy || !holdId}
            onClick={() =>
              run("deny", async () => {
                const { result } = await post<{ result: StepResult }>("/api/demo/hold", {
                  holdId,
                  approve: true,
                  approver: unverified.key,
                  // Forces the check on for this attempt whatever the switch says.
                  requireVerified: true,
                });
                return { result };
              })
            }
          />
        ) : null}
      </div>
    ),
    approve: (
      <Btn
        label={`${nameOf(cast.approver)} approves`}
        disabled={busy || !holdId}
        onClick={() =>
          run("approve", async () => {
            const { result } = await post<{ result: StepResult }>("/api/demo/hold", {
              holdId,
              approve: true,
              approver: cast.approver,
              requireVerified: enforce,
            });
            if (!result.reverted) setHoldId(null);
            return { result };
          })
        }
      />
    ),
    replay: (
      <Btn
        label="Verify against Hedera"
        disabled={busy}
        onClick={() =>
          run("replay", async () => {
            const data = await post<{ report: Replay | null }>("/api/demo/replay", {});
            if (!data.report) throw new Error("the topic or gate is not configured");
            return { replay: data.report };
          })
        }
      />
    ),
  };

  async function reset() {
    if (!window.confirm("Cancel open orders and return the vendor's USDT to the vault?")) return;
    setResetting(true);
    try {
      await post("/api/demo/reset", {});
      setRuns({});
      setPoId(null);
      setHoldId(null);
      setRaisedQty(null);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    } finally {
      setResetting(false);
      void refresh();
    }
  }

  const people = info?.humans ?? [];

  return (
    <div style={{ maxWidth: 820 }}>
      <h1 style={{ fontSize: 34, marginBottom: "var(--space-2)" }}>Walkthrough</h1>
      <p style={{ color: "var(--text-muted)", maxWidth: "var(--measure)", marginTop: 0 }}>
        Eleven steps against the real gate on Whitechain Sepolia, with every decision written to a
        Hedera topic. Nothing here is mocked: each step is a transaction you can open.
      </p>

      {info && !info.enabled ? (
        <div
          style={{
            border: "1px solid var(--held)",
            background: "var(--held-bg)",
            color: "var(--held)",
            borderRadius: "var(--radius)",
            padding: "var(--space-3) var(--space-4)",
            margin: "var(--space-4) 0",
          }}
        >
          {info.switchedOff
            ? "The demo executor is switched off on this deployment, so this page is read-only."
            : `The demo executor is missing: ${info.missing.join(", ")}.`}
        </div>
      ) : null}

      <section
        style={{
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          background: "var(--surface)",
          padding: "var(--space-4)",
          margin: "var(--space-5) 0",
          display: "grid",
          gap: "var(--space-4)",
        }}
      >
        <div style={{ display: "flex", gap: "var(--space-6)", flexWrap: "wrap", alignItems: "flex-end" }}>
          {(
            [
              ["In the vault", info?.vault?.display.balance],
              ["Reserved", info?.vault?.display.encumbered],
              ["Free", info?.vault?.display.free],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <div style={{ fontSize: 12, color: "var(--text-faint)", letterSpacing: "0.06em" }}>
                {label.toUpperCase()}
              </div>
              <div className="mono" style={{ fontSize: 24 }}>
                {value ?? "—"}
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}> USDT</span>
              </div>
            </div>
          ))}
          <div style={{ marginLeft: "auto", fontSize: 13, textAlign: "right" }}>
            {gate ? <Hash value={gate} href={`https://explorer.testnet.whitechain.io/address/${gate}`} /> : null}
            {topicUrl ? (
              <div>
                <a href={topicUrl} target="_blank" rel="noreferrer">
                  Hedera topic on HashScan
                </a>
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-4)" }}>
          <div style={{ fontSize: 12, color: "var(--text-faint)", letterSpacing: "0.06em", marginBottom: 8 }}>
            WHAT IS BEING BOUGHT
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(Object.keys(SCENARIOS) as Array<keyof typeof SCENARIOS>).map((id) => (
              <button
                key={id}
                type="button"
                disabled={busy}
                onClick={() => setScenarioId(id)}
                style={{
                  padding: "6px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: `1px solid ${scenarioId === id ? "var(--accent)" : "var(--border-strong)"}`,
                  background: scenarioId === id ? "var(--accent)" : "transparent",
                  color: scenarioId === id ? "var(--accent-text)" : "var(--text)",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {SCENARIOS[id].label}
              </button>
            ))}
          </div>
          <p style={{ margin: "var(--space-2) 0 0", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.55 }}>
            {scenario.blurb} The contract only multiplies a quantity by a unit price, so the control
            is identical either way. This sets the next order raised in step 1.
          </p>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-4)" }}>
          <div style={{ fontSize: 12, color: "var(--text-faint)", letterSpacing: "0.06em", marginBottom: 8 }}>
            THE THREE PEOPLE
          </div>
          <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
            {(
              [
                ["creator", "Raises orders"],
                ["receiver", "Signs for deliveries"],
                ["approver", "Releases holds"],
              ] as const
            ).map(([role, label]) => (
              <label key={role} style={{ display: "grid", gap: 4, fontSize: 13 }}>
                <span style={{ color: "var(--text-muted)" }}>{label}</span>
                <select
                  value={cast[role]}
                  onChange={(e) => setCast((c) => ({ ...c, [role]: e.target.value }))}
                  style={{
                    padding: "6px 8px",
                    border: "1px solid var(--border-strong)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--surface)",
                    color: "var(--text)",
                    font: "inherit",
                  }}
                >
                  {people.map((h) => (
                    <option key={h.key} value={h.key}>
                      {h.name}
                      {h.enrolled ? " (World ID)" : " (stand-in)"}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div style={{ marginTop: "var(--space-3)", display: "grid", gap: 10, fontSize: 13 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["creator", "receiver", "approver"] as const).map((role) => {
                const who = people.find((h) => h.key === cast[role]);
                if (!who) return null;
                return (
                  <span
                    key={role}
                    style={{
                      padding: "3px 10px",
                      borderRadius: "var(--radius-sm)",
                      background: who.enrolled ? "var(--paid-bg)" : "var(--held-bg)",
                      color: who.enrolled ? "var(--paid)" : "var(--held)",
                    }}
                  >
                    {role}: {who.name}, {who.enrolled ? "verified with World ID" : "stand-in"}
                  </span>
                );
              })}
            </div>

            <label style={{ display: "flex", gap: 8, alignItems: "center", color: "var(--text-muted)" }}>
              <input
                type="checkbox"
                checked={enforce}
                disabled={Boolean(info?.requireVerified)}
                onChange={(e) => setStrict(e.target.checked)}
              />
              Only people verified with World ID may act
              {info?.requireVerified ? " (required by this deployment)" : ""}
            </label>

            <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.55 }}>
              Each person is a stable identifier: the World ID nullifier from one enrolment. Stand-ins
              exist so the flow can be rehearsed;{" "}
              <Link href="/enroll">verify real people</Link> and they appear in these lists. Try the
              same person in two roles and see what the contract says.
            </p>
          </div>
        </div>
      </section>

      {ACTS.map((act) => (
        <section key={act.id} style={{ marginTop: "var(--space-7)" }}>
          <h2 style={{ fontSize: 24, marginBottom: "var(--space-4)" }}>{act.title}</h2>
          <div style={{ display: "grid", gap: "var(--space-4)" }}>
            {STEPS.filter((s) => s.act === act.id).map((step) => {
              const n = STEPS.findIndex((s) => s.id === step.id) + 1;
              const state = runs[step.id] ?? IDLE;
              const locked = (step.needs === "po" && !poId) || (step.needs === "hold" && !holdId);
              return (
                <article
                  key={step.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    background: "var(--surface)",
                    padding: "var(--space-4) var(--space-5)",
                    opacity: locked && state.status === "idle" ? 0.55 : 1,
                  }}
                >
                  <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                    <span className="mono" style={{ color: "var(--text-faint)" }}>
                      {String(n).padStart(2, "0")}
                    </span>
                    <h3 style={{ fontFamily: "var(--font-body)", fontSize: 18, fontWeight: 600 }}>
                      {step.title}
                    </h3>
                    {state.status === "running" ? (
                      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                        waiting for the chain…
                      </span>
                    ) : state.ms ? (
                      <span className="mono" style={{ fontSize: 12, color: "var(--text-faint)" }}>
                        {(state.ms / 1000).toFixed(1)}s
                      </span>
                    ) : null}
                  </div>

                  <p style={{ color: "var(--text-muted)", margin: "var(--space-2) 0 var(--space-4)" }}>
                    {typeof step.what === "function" ? step.what(scenario) : step.what}
                  </p>

                  <div>{actions[step.id]}</div>

                  {locked && state.status === "idle" ? (
                    <p style={{ margin: "var(--space-3) 0 0", fontSize: 13, color: "var(--text-faint)" }}>
                      {step.needs === "hold"
                        ? "Needs a held invoice from the over-price step."
                        : "Needs a purchase order from step 1."}
                    </p>
                  ) : null}

                  {state.status === "error" ? (
                    <p
                      style={{
                        margin: "var(--space-3) 0 0",
                        padding: "var(--space-3)",
                        borderRadius: "var(--radius-sm)",
                        background: "var(--rejected-bg)",
                        color: "var(--rejected)",
                        fontSize: 14,
                      }}
                    >
                      {state.error}
                    </p>
                  ) : null}

                  {state.results.map((r) => (
                    <ResultCard key={r.tx.hash} result={r} names={names} topicUrl={topicUrl} />
                  ))}

                  {state.replay ? <ReplayView replay={state.replay} topicUrl={topicUrl} /> : null}
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <section
        style={{
          marginTop: "var(--space-7)",
          paddingTop: "var(--space-5)",
          borderTop: "1px solid var(--border)",
          display: "flex",
          gap: "var(--space-4)",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <Btn label={resetting ? "Resetting…" : "Reset"} tone="quiet" disabled={busy || resetting} onClick={reset} />
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Cancels open orders and has the vendor return what it was paid, so the walkthrough can run
          again. The contract has no withdraw function, so this is the only way funds go back.
        </span>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------- bits -- */

const chip: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text-muted)",
  borderRadius: "var(--radius-sm)",
  padding: "4px 10px",
  fontSize: 13,
  cursor: "pointer",
};

function Btn({
  label,
  onClick,
  disabled,
  tone = "primary",
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "quiet";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        background: tone === "primary" ? "var(--accent)" : "transparent",
        color: tone === "primary" ? "var(--accent-text)" : "var(--text)",
        border: tone === "primary" ? "none" : "1px solid var(--border-strong)",
        borderRadius: "var(--radius-sm)",
        padding: "9px 16px",
        fontSize: 14,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  );
}
