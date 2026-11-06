import Link from "next/link";
import { REASON_CODES, REASON_TEXT, SEVERITY } from "@zowall/gate-core";

import { workspaceState } from "@/lib/product";

export const dynamic = "force-dynamic";

/**
 * The rules are read-only on purpose.
 *
 * They are compiled into the contract, not stored as configuration, which is
 * the reason the control is worth anything: a buyer who can edit the rules at
 * the moment of payment does not have a control, they have a preference.
 */
export default async function RulesStep() {
  const state = await workspaceState();

  return (
    <>
      <div className="ui-split">
        <div>
          <h1 className="ui-title">Rules</h1>
          <p className="ui-lede">
            Eleven checks, evaluated in a fixed order, with every failure returned rather than just
            the first. Eight stop a payment outright. Three park it for a different human.
          </p>
          <p className="ui-lede">
            You cannot edit them here, and neither can your agent. They live in the contract.
          </p>
        </div>

        <div className="ui-tiles">
          <div className="ui-tile">
            <span className="ui-stat-label">Hard</span>
            <span className="ui-stat-value">
              {REASON_CODES.filter((c) => SEVERITY[c] === "hard").length}
            </span>
            <p className="ui-tile-body">Refused outright. No money moves.</p>
          </div>
          <div className="ui-tile">
            <span className="ui-stat-label">Soft</span>
            <span className="ui-stat-value">
              {REASON_CODES.filter((c) => SEVERITY[c] === "soft").length}
            </span>
            <p className="ui-tile-body">Held for a third person to decide.</p>
          </div>
        </div>
      </div>

      <section className="ui-section">
        <ul className="ui-numlist">
          {REASON_CODES.map((code, i) => (
            <li key={code} className="ui-numrow">
              <span className="ui-numrow-n">{String(i + 1).padStart(2, "0")}</span>
              <span className="ui-numrow-label">{REASON_TEXT[code]}</span>
              <span className="ui-numrow-note">
                <span className={SEVERITY[code] === "hard" ? "ui-chip ui-chip--bad" : "ui-chip ui-chip--held"}>
                  {SEVERITY[code] === "hard" ? "Refuse" : "Hold"}
                </span>
              </span>
              <span className="ui-numrow-sub ui-mono">{code}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="ui-section">
        <div className="ui-split">
          <div>
            <h2 className="ui-title">Three things that surprise people</h2>
            <p className="ui-lede">
              Each of these was a bug before it was a rule, and each one changes what you see in
              the exception queue.
            </p>
          </div>
          <ul className="ui-numlist">
            <li className="ui-numrow">
              <span className="ui-numrow-n">01</span>
              <span className="ui-numrow-label">The most specific code wins</span>
              <span className="ui-numrow-sub">
                Nothing received suppresses invoiced-more-than-received, which in turn suppresses
                over-budget. Otherwise one fact would be reported as three problems.
              </span>
            </li>
            <li className="ui-numrow">
              <span className="ui-numrow-n">02</span>
              <span className="ui-numrow-label">A quantity variance holds, it does not refuse</span>
              <span className="ui-numrow-sub">
                Hard-refusing it would mean the exception queue never sees the case it exists for.
              </span>
            </li>
            <li className="ui-numrow">
              <span className="ui-numrow-n">03</span>
              <span className="ui-numrow-label">Every failing code comes back</span>
              <span className="ui-numrow-sub">
                A vendor fixing one problem at a time, across days, is how net-60 happens. They get
                the whole list at once.
              </span>
            </li>
          </ul>
        </div>
      </section>

      <div className="ui-actions" style={{ marginTop: "var(--space-6)" }}>
        <Link href="/lab" className="ui-btn ui-btn--primary">
          {state.ready ? "Open the workspace" : "Go to the workspace"}
        </Link>
        <Link href="/lab/start/agent" className="ui-btn">
          Back
        </Link>
      </div>
    </>
  );
}
