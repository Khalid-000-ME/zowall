import Link from "next/link";
import { REASON_TEXT } from "@zowall/gate-core";

import { CopyField } from "@/components/product/CopyField";
import { OutcomeChip } from "@/components/product/OutcomeChip";
import { txUrl } from "@/lib/chains";
import { serverEnv } from "@/lib/env";
import { shortHex, usdt, workspaceState } from "@/lib/product";

export const dynamic = "force-dynamic";

const when = (unix: number) =>
  unix === 0
    ? "—"
    : new Date(unix * 1000).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });

export default async function Agents() {
  const state = await workspaceState();
  const env = serverEnv();
  const calls = [...state.decisions].reverse().slice(0, 12);
  const refused = state.decisions.filter((d) => d.outcome !== "PAID").length;

  return (
    <>
      <header>
        <p className="ui-eyebrow">Connect</p>
        <h1 className="ui-display">Agents</h1>
        <p className="ui-lede">
          Everything your agents asked the gate to pay, and what it decided. The model proposes;
          this contract disposes.
        </p>
      </header>

      <section className="ui-section">
        <div className="ui-tiles">
          <div className="ui-tile">
            <span className="ui-stat-label">Calls</span>
            <span className="ui-stat-value">{state.decisions.length}</span>
            <p className="ui-tile-body">Decisions the gate has made.</p>
          </div>
          <div className="ui-tile">
            <span className="ui-stat-label">Stopped</span>
            <span className="ui-stat-value">{refused}</span>
            <p className="ui-tile-body">Payments that did not happen.</p>
          </div>
          <div className="ui-tile">
            <span className="ui-stat-label">Status</span>
            <span className="ui-stat-value" style={{ fontSize: 18, paddingTop: 6 }}>
              {state.decisions.length > 0 ? (
                <span className="ui-chip ui-chip--ok">
                  <span className="ui-dot" />
                  Live
                </span>
              ) : (
                <span className="ui-chip">
                  <span className="ui-dot" />
                  Waiting
                </span>
              )}
            </span>
            <p className="ui-tile-body">
              {state.decisions.length > 0 ? "The gate is being called." : "No calls yet."}
            </p>
          </div>
        </div>
      </section>

      <section className="ui-section">
        <div className="ui-split">
          <div>
            <h2 className="ui-title">Connection</h2>
            <p className="ui-lede">
              One endpoint, one address. Point an agent at these and it can propose a payment but
              never make one on its own.
            </p>
            <p style={{ marginTop: "var(--space-4)" }}>
              <Link href="/app/start/agent" className="ui-numrow-note">
                Setup instructions →
              </Link>
            </p>
          </div>
          <div className="ui-panel">
            <div style={{ display: "grid", gap: "var(--space-4)" }}>
              <CopyField label="Gate address" value={env.gateAddress ?? "not configured"} />
              <CopyField label="Chain id" value={String(env.chainId)} />
              <CopyField label="Metered quote endpoint" value="POST /api/x402/match" />
            </div>
          </div>
        </div>
      </section>

      <section className="ui-section">
        <h2 className="ui-title">Call log</h2>
        {calls.length === 0 ? (
          <p className="ui-lede">
            Nothing yet. Every call lands here with the transaction that proves what happened.
          </p>
        ) : (
          <table className="ui-table" style={{ marginTop: "var(--space-5)" }}>
            <thead>
              <tr>
                <th>Outcome</th>
                <th>Order</th>
                <th>Asked for</th>
                <th>Reason</th>
                <th>Proof</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((d) => (
                <tr key={d.txHash}>
                  <td>
                    <OutcomeChip outcome={d.outcome} />
                  </td>
                  <td className="ui-mono">#{d.poId.toString()}</td>
                  <td className="ui-mono">{usdt(d.invQty * d.invUnitPrice)}</td>
                  <td style={{ color: "var(--text-muted)", fontSize: 13.5 }}>
                    {d.codes.length === 0
                      ? "Matched the order and the receipt."
                      : d.codes.map((c) => REASON_TEXT[c]).join(" ")}
                  </td>
                  <td>
                    <a
                      href={txUrl(env.chainId, d.txHash) ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="ui-mono"
                    >
                      {shortHex(d.txHash, 6, 4)}
                    </a>
                  </td>
                  <td className="ui-mono ui-faint">{when(d.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="ui-section">
        <div className="ui-note">
          Agent identity is not bound per agent yet. The gate authenticates the vendor&rsquo;s
          signature and the three humans, not which agent submitted the invoice, so two agents
          sharing a wallet are one caller as far as this log is concerned.
        </div>
      </section>
    </>
  );
}
