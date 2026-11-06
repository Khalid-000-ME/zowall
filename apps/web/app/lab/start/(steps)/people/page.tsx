import Link from "next/link";

import { EnrollCard } from "@/components/product/EnrollCard";
import { ROLES_NEEDED, shortHex, workspaceState } from "@/lib/product";

export const dynamic = "force-dynamic";

const ROLES = [
  {
    n: "01",
    title: "Raises the order",
    blurb: "Commits the money up front. Usually whoever runs the agent.",
  },
  {
    n: "02",
    title: "Signs for delivery",
    blurb: "Confirms what actually arrived. Never the same person as 01.",
  },
  {
    n: "03",
    title: "Approves exceptions",
    blurb: "Releases an invoice that is close but not clean. Never 01 or 02.",
  },
] as const;

export default async function PeopleStep() {
  const state = await workspaceState();
  const verified = state.verified;
  const enough = verified.length >= ROLES_NEEDED;

  return (
    <>
      <div className="ui-split">
        <div>
          <h1 className="ui-title">People</h1>
          <p className="ui-lede">
            The gate enforces that three different humans touched a payment. It cannot do that
            against names or wallets, which one person can hold several of. It does it against a
            World ID nullifier: one per human, per action, and impossible to hold two of.
          </p>
          <p className="ui-lede">
            Verify at least {ROLES_NEEDED}. Who plays which role is chosen per order, not here.
          </p>
        </div>

        <div style={{ display: "grid", gap: "var(--space-5)" }}>
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: "var(--space-3)",
              }}
            >
              <h2 className="ui-tile-title">Verified</h2>
              <span className={enough ? "ui-chip ui-chip--ok" : "ui-chip ui-chip--held"}>
                {verified.length} of {ROLES_NEEDED}
              </span>
            </div>

            {verified.length === 0 ? (
              <p className="ui-tile-body">
                Nobody yet. The first person to verify becomes the one who can raise an order.
              </p>
            ) : (
              <ul className="ui-numlist">
                {verified.map((person, i) => (
                  <li key={person.personId} className="ui-numrow">
                    <span className="ui-numrow-n">{String(i + 1).padStart(2, "0")}</span>
                    <span className="ui-numrow-label">{person.name}</span>
                    <span className="ui-numrow-note">
                      <span className="ui-chip ui-chip--ok">World ID</span>
                    </span>
                    <span className="ui-numrow-sub ui-mono">{shortHex(person.personId, 14, 8)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <EnrollCard />
        </div>
      </div>

      <section className="ui-section">
        <div className="ui-split">
          <div>
            <h2 className="ui-title">The three roles</h2>
            <p className="ui-lede">
              Separation of duties, the way an auditor tests for it. The contract reverts if one
              person tries to hold two of these on one order.
            </p>
          </div>
          <ul className="ui-numlist">
            {ROLES.map((role) => (
              <li key={role.n} className="ui-numrow">
                <span className="ui-numrow-n">{role.n}</span>
                <span className="ui-numrow-label">{role.title}</span>
                <span className="ui-numrow-sub">{role.blurb}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="ui-actions" style={{ marginTop: "var(--space-6)" }}>
        <Link href="/lab/start/vault" className="ui-btn ui-btn--primary">
          Next: Vault
        </Link>
      </div>
    </>
  );
}
