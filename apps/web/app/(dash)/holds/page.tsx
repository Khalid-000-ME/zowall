import Link from "next/link";
import { REASON_TEXT, formatUsdt } from "@zowall/gate-core";

import { Empty } from "@/components/Empty";
import { decisions, purchaseOrders } from "@/lib/store";

/**
 * The exception queue. Every row needs a different human to clear it than the
 * one who raised the PO or signed for the delivery - which the contract
 * enforces, so this page only has to explain it.
 */
export default function HoldsPage() {
  const held = decisions.held();

  return (
    <>
      <h1 style={{ fontSize: 30, marginBottom: "var(--space-2)" }}>Holds</h1>
      <p style={{ color: "var(--text-muted)", marginTop: 0, maxWidth: "var(--measure)" }}>
        Funds stay reserved. Releasing one needs a third person: not whoever raised the purchase
        order, not whoever signed for the delivery.
      </p>

      {held.length === 0 ? (
        <Empty title="Nothing held. Every invoice so far either matched or was refused outright." />
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "var(--space-3)" }}>
          {held.map((d) => {
            const po = purchaseOrders.get(d.poId);
            return (
              <li
                key={d.invoiceHash}
                style={{
                  border: "1px solid var(--border)",
                  borderLeft: "3px solid var(--held)",
                  borderRadius: "var(--radius)",
                  padding: "var(--space-4)",
                  background: "var(--surface)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <strong>
                    PO #{d.poId.toString()} · {po?.description ?? "unknown"}
                  </strong>
                  <span className="mono">{formatUsdt(d.qty * d.unitPrice)} USDT</span>
                </div>
                <ul style={{ margin: "var(--space-3) 0 0", paddingLeft: "1.1rem" }}>
                  {d.codes.map((code) => (
                    <li key={code} style={{ color: "var(--text-muted)" }}>
                      {REASON_TEXT[code]}
                    </li>
                  ))}
                </ul>
                <Link href={`/match/${d.poId}`} style={{ fontSize: 14 }}>
                  Compare the three documents
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
