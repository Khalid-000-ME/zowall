import { REASON_TEXT } from "@zowall/gate-core";

import { ResolveHold } from "@/components/product/ResolveHold";
import { getOpenHolds, getPO, type ChainHold } from "@/lib/chain";
import { serverEnv } from "@/lib/env";
import { humans, nameOf } from "@/lib/humans";
import { usdt } from "@/lib/product";

export const dynamic = "force-dynamic";

export default async function Exceptions() {
  const env = serverEnv();
  const people = humans().map((h) => ({ key: h.key, name: h.name, enrolled: h.enrolled }));

  let holds: ChainHold[] = [];
  let reachable = true;
  try {
    holds = await getOpenHolds();
  } catch {
    reachable = false;
  }

  const withPO = await Promise.all(
    holds.map(async (h) => {
      try {
        return { hold: h, po: await getPO(h.poId) };
      } catch {
        return { hold: h, po: null };
      }
    }),
  );

  return (
    <>
      <header>
        <p className="ui-eyebrow">Workspace</p>
        <h1 className="ui-display">Exceptions</h1>
        <p className="ui-lede">
          Invoices the gate would not pay on its own and would not refuse outright. Each needs a
          person who did not raise the order and did not sign for the delivery.
        </p>
      </header>

      {!reachable ? (
        <div className="ui-note ui-note--warn" style={{ marginTop: "var(--space-5)" }}>
          The Whitechain testnet node did not answer. This queue may be incomplete.
        </div>
      ) : null}

      {env.requireVerified ? (
        <div className="ui-note" style={{ marginTop: "var(--space-5)" }}>
          Strict mode is on: only people who have verified with World ID can act.
        </div>
      ) : null}

      <section className="ui-section">
        {withPO.length === 0 ? (
          <p className="ui-lede">
            Nothing waiting. A price above tolerance, a quantity over what arrived, or an invoice
            with no receipt yet would land here.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "var(--space-5)" }}>
            {withPO.map(({ hold, po }) => (
              <div key={hold.id.toString()} className="ui-panel">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "var(--space-4)",
                    flexWrap: "wrap",
                    alignItems: "baseline",
                  }}
                >
                  <div>
                    <h2 className="ui-tile-title">
                      Order #{hold.poId.toString()} · hold #{hold.id.toString()}
                    </h2>
                    <p className="ui-tile-body" style={{ marginTop: 5 }}>
                      {hold.codes.map((c) => REASON_TEXT[c]).join(" ")}
                    </p>
                  </div>
                  <span className="ui-chip ui-chip--held">
                    <span className="ui-dot" />
                    Held
                  </span>
                </div>

                <div className="ui-row" style={{ marginTop: "var(--space-4)" }}>
                  <span className="ui-muted">Invoice</span>
                  <span className="ui-mono">
                    {hold.qty.toString()} × {usdt(hold.unitPrice)} = {usdt(hold.qty * hold.unitPrice)}
                  </span>
                </div>
                {po ? (
                  <>
                    <div className="ui-row">
                      <span className="ui-muted">Agreed</span>
                      <span className="ui-mono">
                        {po.qty.toString()} × {usdt(po.unitPrice)} · {po.priceTolBps / 100}% tolerance
                      </span>
                    </div>
                    <div className="ui-row">
                      <span className="ui-muted">Received</span>
                      <span className="ui-mono">{po.received.toString()}</span>
                    </div>
                    <div className="ui-row">
                      <span className="ui-muted">Cannot decide this</span>
                      <span>
                        {nameOf(po.creatorPersonId)} · {nameOf(po.receiverPersonId)}
                      </span>
                    </div>
                  </>
                ) : null}

                <div style={{ marginTop: "var(--space-5)" }}>
                  <ResolveHold
                    holdId={hold.id.toString()}
                    people={people}
                    requireVerified={env.requireVerified}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
