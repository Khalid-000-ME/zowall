import { notFound } from "next/navigation";
import { REASON_TEXT, formatUsdt } from "@zowall/gate-core";

import { Panel } from "@/components/Empty";
import { OutcomeBadge } from "@/components/Outcome";
import { decisions, purchaseOrders } from "@/lib/store";

/**
 * The vendor's view: status, and why, in plain language.
 *
 * A vendor can see that funds are reserved against their purchase order
 * before they ship, without being given access to the buyer's books. That is
 * the thing a normal payment rail cannot do, and the reason this settles
 * on-chain.
 */
export default async function VendorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const po = purchaseOrders.byVendorToken(token);
  if (!po) notFound();

  const history = decisions.forPO(po.id);
  const latest = history.at(-1);

  return (
    <div className="page" style={{ paddingBlock: "var(--space-7)", maxWidth: 640 }}>
      <p style={{ color: "var(--text-faint)", fontSize: 13, margin: 0 }}>Purchase order</p>
      <h1 style={{ fontSize: 30 }}>#{po.id.toString()}</h1>
      <p style={{ color: "var(--text-muted)" }}>{po.description}</p>

      <div style={{ display: "grid", gap: "var(--space-4)", marginTop: "var(--space-5)" }}>
        <Panel title="What is agreed">
          <p style={{ margin: 0 }} className="mono">
            {po.qty.toString()} × {formatUsdt(po.unitPrice)} USDT ={" "}
            {formatUsdt(po.qty * po.unitPrice)} USDT
          </p>
          <p style={{ marginBottom: 0, color: "var(--text-muted)", fontSize: 14 }}>
            Reserved against this order before you ship. Price tolerance {po.priceTolBps / 100}%.
          </p>
        </Panel>

        <Panel title="Where your invoice stands">
          {latest ? (
            <div style={{ display: "grid", gap: "var(--space-3)" }}>
              <OutcomeBadge outcome={latest.outcome} large />
              {latest.codes.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                  {latest.codes.map((code) => (
                    <li key={code}>{REASON_TEXT[code]}</li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: 0 }}>Paid in full.</p>
              )}
            </div>
          ) : (
            <p style={{ margin: 0, color: "var(--text-muted)" }}>
              No invoice submitted yet. {po.received.toString()} of {po.qty.toString()} recorded as
              received.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
