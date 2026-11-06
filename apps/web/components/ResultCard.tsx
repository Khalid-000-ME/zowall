"use client";

import { useEffect, useState } from "react";

import { Hash } from "@/components/Hash";
import { OutcomeBadge } from "@/components/Outcome";
import type { StepResult } from "@/lib/demo";

const usdt = (base: string) => (Number(base) / 1_000_000).toFixed(2);

type Hedera =
  | { state: "waiting" }
  | { state: "found"; sequence: number; topic: string | null; digest: string }
  | { state: "none" };

/**
 * Every decision is also written to Hedera, after the response, because a
 * consensus round trip outlasts the HTTP call. So the card asks the mirror node
 * until the entry shows up, which is also the most direct way to show that the
 * second record exists and is the same one.
 */
function useHedera(tx: string, enabled: boolean): Hedera {
  const [state, setState] = useState<Hedera>(enabled ? { state: "waiting" } : { state: "none" });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const started = Date.now();

    async function poll() {
      while (!cancelled && Date.now() - started < 90_000) {
        try {
          const res = await fetch(`/api/demo/journal?tx=${tx}`);
          const data = (await res.json()) as {
            found?: boolean;
            sequence?: number;
            topic?: string | null;
            digest?: string;
          };
          if (data.found && !cancelled) {
            setState({
              state: "found",
              sequence: data.sequence ?? 0,
              topic: data.topic ?? null,
              digest: data.digest ?? "",
            });
            return;
          }
        } catch {
          // the mirror node is occasionally slow; keep asking
        }
        await new Promise((r) => setTimeout(r, 2_500));
      }
      if (!cancelled) setState({ state: "none" });
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [tx, enabled]);

  return state;
}

export function ResultCard({
  result,
  names,
  topicUrl,
}: {
  result: StepResult;
  names: Record<string, string>;
  topicUrl?: string | null;
}) {
  const failed = result.tx.status === "reverted";
  const decision = result.decision;
  const hedera = useHedera(result.tx.hash, !failed);

  const who = (personId: string) =>
    personId === `0x${"00".repeat(32)}` ? "nobody" : (names[personId.toLowerCase()] ?? `${personId.slice(0, 10)}…`);

  return (
    <div
      style={{
        marginTop: "var(--space-4)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        background: "var(--surface-sunken)",
        padding: "var(--space-4)",
        display: "grid",
        gap: "var(--space-3)",
      }}
    >
      {failed ? (
        <>
          <div>
            <span
              style={{
                background: "var(--rejected-bg)",
                color: "var(--rejected)",
                padding: "6px 14px",
                borderRadius: "var(--radius-sm)",
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: "0.04em",
              }}
            >
              DENIED
            </span>
            {result.reverted?.reason ? (
              <span className="mono" style={{ marginLeft: 12, color: "var(--rejected)" }}>
                {result.reverted.reason}
              </span>
            ) : null}
          </div>
          <p style={{ margin: 0 }}>{result.reverted?.message}</p>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 14 }}>
            The transaction reverted on-chain, so the protected action did not happen. Nothing
            moved and the hold is still open.
          </p>
        </>
      ) : decision ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <OutcomeBadge outcome={decision.outcome} large />
            {decision.codes.length > 0 ? (
              <span className="mono" style={{ fontSize: 14 }}>
                {decision.codes.join("  ")}
              </span>
            ) : null}
            {BigInt(decision.paid) > 0n ? (
              <span className="mono" style={{ color: "var(--paid)" }}>
                {usdt(decision.paid)} USDT sent
              </span>
            ) : null}
          </div>
          {decision.reasons.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: "1.1rem", color: "var(--text-muted)" }}>
              {decision.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              background: "var(--paid-bg)",
              color: "var(--paid)",
              padding: "6px 14px",
              borderRadius: "var(--radius-sm)",
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: "0.04em",
            }}
          >
            CONFIRMED
          </span>
          {result.poId ? <span className="mono">PO #{result.poId}</span> : null}
          {result.paid && BigInt(result.paid) > 0n ? (
            <span className="mono" style={{ color: "var(--paid)" }}>
              {usdt(result.paid)} USDT sent
            </span>
          ) : null}
          {result.amended && BigInt(result.amended) > 0n ? (
            <span className="mono" style={{ color: "var(--held)" }}>
              reservation amended by {usdt(result.amended)} USDT
            </span>
          ) : null}
        </div>
      )}

      <div style={{ display: "flex", gap: "var(--space-5)", flexWrap: "wrap", fontSize: 13 }}>
        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
          <span style={{ color: "var(--text-faint)" }}>Whitechain</span>
          <Hash value={result.tx.hash} href={result.tx.explorerUrl} />
        </span>

        {failed ? null : (
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <span style={{ color: "var(--text-faint)" }}>Hedera</span>
            {hedera.state === "waiting" ? (
              <span style={{ color: "var(--text-muted)" }}>writing to the journal…</span>
            ) : hedera.state === "found" ? (
              <a
                href={topicUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                style={{
                  color:
                    !decision || hedera.digest.toLowerCase() === decision.digest.toLowerCase()
                      ? "var(--paid)"
                      : "var(--rejected)",
                }}
              >
                entry #{hedera.sequence}
                {decision
                  ? hedera.digest.toLowerCase() === decision.digest.toLowerCase()
                    ? " · same digest"
                    : " · DIGEST DIFFERS"
                  : ""}
              </a>
            ) : (
              <span style={{ color: "var(--text-faint)" }}>not seen yet</span>
            )}
          </span>
        )}
      </div>

      {decision ? (
        <details>
          <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--text-muted)" }}>
            Under the hood: what the log says
          </summary>
          <div style={{ marginTop: "var(--space-3)", fontSize: 13, display: "grid", gap: 6 }}>
            <p style={{ margin: 0, color: "var(--text-muted)" }}>
              The Decision event carries the 448 bytes the digest is taken over. Everything
              below was recovered from that log alone.
            </p>
            {(
              [
                ["purchase order", `#${decision.preimage.poId}`],
                ["invoiced", `${decision.preimage.invQty} @ ${usdt(decision.preimage.invUnitPrice)} USDT`],
                ["received", `${decision.preimage.recvQty}`],
                ["agreed price", `${usdt(decision.preimage.poUnitPrice)} USDT`],
                ["creator", who(decision.preimage.creator)],
                ["receiver", who(decision.preimage.receiver)],
                ["approver", who(decision.preimage.approver)],
                ["reason mask", `${decision.reasonMask}`],
                ["digest", decision.digest],
              ] as const
            ).map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 12 }}>
                <span style={{ color: "var(--text-faint)", minWidth: 110 }}>{k}</span>
                <span className="mono" style={{ wordBreak: "break-all" }}>
                  {v}
                </span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
