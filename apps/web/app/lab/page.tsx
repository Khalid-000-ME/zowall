import Link from "next/link";
import { REASON_TEXT } from "@zowall/gate-core";

import { OutcomeChip } from "@/components/product/OutcomeChip";
import { getOpenHolds, type ChainHold } from "@/lib/chain";
import { nameOf } from "@/lib/humans";
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

export default async function Overview() {
  const state = await workspaceState();

  let holds: ChainHold[] = [];
  try {
    holds = await getOpenHolds();
  } catch {
    // Shown as zero below; the chain banner already explains the gap.
  }

  const recent = [...state.decisions].reverse().slice(0, 8);
  const paid = state.decisions.filter((d) => d.outcome === "PAID");
  const refused = state.decisions.filter((d) => d.outcome === "REJECTED");
  const movedTotal = paid.reduce((sum, d) => sum + (d.paid ?? 0n), 0n);
  const left = state.steps.filter((s) => !s.done);

  return (
    <>
      <header>
        <p className="ui-eyebrow">Workspace</p>
        <h1 className="ui-display">What your agents tried to pay.</h1>
        <p className="ui-lede">
          Every row below is a decision the contract made on its own. The model proposed it; the
          rules disposed of it.
        </p>
      </header>

      {!state.chainReachable ? (
        <div className="ui-note ui-note--warn" style={{ marginTop: "var(--space-5)" }}>
          The Whitechain testnet node did not answer. Figures on this page may be incomplete until
          it does.
        </div>
      ) : null}

      {left.length > 0 ? (
        <div className="ui-panel ui-panel--sunken" style={{ marginTop: "var(--space-5)" }}>
          <div
            style={{
              display: "flex",
              gap: "var(--space-4)",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 style={{ fontSize: 16 }}>Setup is not finished</h2>
              <p className="ui-tile-body" style={{ marginTop: 4 }}>
                {left.map((s) => s.title).join(", ")} still to do. The gate will refuse everything
                until the vault holds something to spend.
              </p>
            </div>
            <Link href="/lab/start" className="ui-btn ui-btn--primary">
              Continue setup
            </Link>
          </div>
        </div>
      ) : null}

      <section className="ui-section">
        <div className="ui-tiles">
          <div className="ui-tile">
            <span className="ui-stat-label">Vault</span>
            <span className="ui-stat-value">{state.vault ? usdt(state.vault.balance) : "—"}</span>
            <p className="ui-tile-body">USDT the gate holds.</p>
          </div>
          <div className="ui-tile">
            <span className="ui-stat-label">Reserved</span>
            <span className="ui-stat-value">{state.vault ? usdt(state.vault.encumbered) : "—"}</span>
            <p className="ui-tile-body">Committed to open orders.</p>
          </div>
          <div className="ui-tile">
            <span className="ui-stat-label">Paid</span>
            <span className="ui-stat-value">{usdt(movedTotal)}</span>
            <p className="ui-tile-body">
              {paid.length} invoice{paid.length === 1 ? "" : "s"} matched.
            </p>
          </div>
          <div className="ui-tile">
            <span className="ui-stat-label">Refused</span>
            <span className="ui-stat-value">{refused.length}</span>
            <p className="ui-tile-body">Stopped before any money moved.</p>
          </div>
        </div>
      </section>

      {holds.length > 0 ? (
        <section className="ui-section">
          <div className="ui-split">
            <div>
              <h2 className="ui-title">Waiting on a person</h2>
              <p className="ui-lede">
                These did not break a rule outright. They need someone who did not raise the order
                and did not sign for delivery.
              </p>
            </div>
            <ul className="ui-numlist">
              {holds.map((h, i) => (
                <li key={h.id.toString()} className="ui-numrow">
                  <span className="ui-numrow-n">{String(i + 1).padStart(2, "0")}</span>
                  <span className="ui-numrow-label">
                    {h.codes.map((c) => REASON_TEXT[c]).join(" ")}
                  </span>
                  <Link href="/lab/exceptions" className="ui-numrow-note">
                    Order #{h.poId.toString()} →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="ui-section">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 className="ui-title">Recent decisions</h2>
          <Link href="/lab/orders" className="ui-numrow-note">
            All orders →
          </Link>
        </div>

        {recent.length === 0 ? (
          <p className="ui-lede">
            Nothing yet. The first call your agent makes to the gate shows up here.
          </p>
        ) : (
          <table className="ui-table" style={{ marginTop: "var(--space-5)" }}>
            <thead>
              <tr>
                <th>Outcome</th>
                <th>Order</th>
                <th>Amount</th>
                <th>Why</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((d) => (
                <tr key={d.txHash}>
                  <td>
                    <OutcomeChip outcome={d.outcome} />
                  </td>
                  <td className="ui-mono">#{d.poId.toString()}</td>
                  <td className="ui-mono">
                    {d.paid && d.paid > 0n ? usdt(d.paid) : usdt(d.invQty * d.invUnitPrice)}
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: 13.5 }}>
                    {d.codes.length === 0
                      ? "Matched the order and the receipt."
                      : d.codes.map((c) => REASON_TEXT[c]).join(" ")}
                  </td>
                  <td className="ui-mono ui-faint">{when(d.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="ui-section">
        <div className="ui-split">
          <div>
            <h2 className="ui-title">Your people</h2>
            <p className="ui-lede">
              The gate compares these ids, not names or wallets. One human cannot hold two roles on
              one order.
            </p>
          </div>
          <ul className="ui-numlist">
            {state.people.map((h, i) => (
              <li key={h.personId} className="ui-numrow">
                <span className="ui-numrow-n">{String(i + 1).padStart(2, "0")}</span>
                <span className="ui-numrow-label">{nameOf(h.personId)}</span>
                <span className="ui-numrow-note">
                  <span className="ui-chip ui-chip--ok">World ID</span>
                </span>
                <span className="ui-numrow-sub ui-mono">{shortHex(h.personId, 10, 6)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
