import Link from "next/link";

import { EndpointForm } from "@/components/account/EndpointForm";
import { EndpointRowActions } from "@/components/account/EndpointRowActions";
import { ago, formatPrice } from "@/lib/amounts";
import { endpointsOf } from "@/lib/registry";
import { requireAccount } from "@/lib/session";

export const dynamic = "force-dynamic";

const CHIP = {
  verified: "ui-chip ui-chip--ok",
  failing: "ui-chip ui-chip--bad",
  pending: "ui-chip ui-chip--held",
} as const;

const LABEL = { verified: "Verified", failing: "Failing", pending: "Pending" } as const;

export default async function Endpoints() {
  const account = await requireAccount("vendor");
  const endpoints = endpointsOf(account.id);

  return (
    <>
      <header>
        <p className="ui-eyebrow">Selling</p>
        <h1 className="ui-display">Endpoints</h1>
        <p className="ui-lede">
          Register the x402 endpoints you sell. Once one answers our check it is listed in the{" "}
          <Link href="/registry">registry</Link>, where buyers&rsquo; agents can find it.
        </p>
      </header>

      <section className="ui-section">
        <EndpointForm />
      </section>

      <section className="ui-section">
        <h2 className="ui-title">Your endpoints</h2>

        {endpoints.length === 0 ? (
          <p className="ui-lede">None yet. Register your first above.</p>
        ) : (
          <div style={{ display: "grid", gap: "var(--space-4)", marginTop: "var(--space-5)" }}>
            {endpoints.map((e) => (
              <div key={e.id} className="ui-panel">
                <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-4)", flexWrap: "wrap", alignItems: "baseline" }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 className="ui-tile-title" style={{ fontSize: 16 }}>
                      {e.status === "verified" && e.visibility === "public" ? (
                        <Link href={`/registry/${e.id}`}>{e.name}</Link>
                      ) : (
                        e.name
                      )}
                    </h3>
                    <div className="ui-mono ui-faint" style={{ overflowWrap: "anywhere", marginTop: 4 }}>
                      {e.url}
                    </div>
                  </div>
                  <span className={CHIP[e.status]}>
                    <span className="ui-dot" />
                    {LABEL[e.status]}
                  </span>
                </div>

                <div className="ui-row" style={{ marginTop: "var(--space-3)" }}>
                  <span className="ui-muted">Price</span>
                  <span className="ui-mono">{formatPrice(e.asset, e.amount)} per call</span>
                </div>
                <div className="ui-row">
                  <span className="ui-muted">Paid to</span>
                  <span className="ui-mono">{e.payTo}</span>
                </div>
                <div className="ui-row">
                  <span className="ui-muted">Listing</span>
                  <span>{e.visibility === "public" ? "Public" : "Private"}</span>
                </div>
                <div className="ui-row">
                  <span className="ui-muted">Last checked</span>
                  <span>{e.verification ? ago(e.verification.checkedAt) : "never"}</span>
                </div>

                {e.status === "failing" && e.verification ? (
                  <div className="ui-note ui-note--warn" style={{ marginTop: "var(--space-3)" }}>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {e.verification.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div style={{ marginTop: "var(--space-4)" }}>
                  <EndpointRowActions id={e.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
