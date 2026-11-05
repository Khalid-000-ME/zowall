import Link from "next/link";
import { formatUsdt } from "@zowall/gate-core";

import { Empty } from "@/components/Empty";
import { purchaseOrders } from "@/lib/store";

export default function PurchaseOrdersPage() {
  const all = purchaseOrders.all();

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "var(--space-5)",
        }}
      >
        <h1 style={{ fontSize: 30 }}>Purchase orders</h1>
        <Link
          href="/po/new"
          style={{
            background: "var(--accent)",
            color: "var(--accent-text)",
            padding: "8px 16px",
            borderRadius: "var(--radius-sm)",
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          New
        </Link>
      </div>

      {all.length === 0 ? (
        <Empty title="No purchase orders yet. Raise one to reserve funds against it." />
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--text-faint)", fontSize: 12 }}>
              <th style={{ padding: "8px 0" }}>PO</th>
              <th>Description</th>
              <th>Ordered</th>
              <th>Received</th>
              <th>Invoiced</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {all.map((po) => (
              <tr key={po.id.toString()} style={{ borderTop: "1px solid var(--border)" }}>
                <td style={{ padding: "10px 0" }}>
                  <Link href={`/match/${po.id}`} className="mono">
                    #{po.id.toString()}
                  </Link>
                </td>
                <td>{po.description}</td>
                <td className="mono">
                  {po.qty.toString()} @ {formatUsdt(po.unitPrice)}
                </td>
                <td className="mono">{po.received.toString()}</td>
                <td className="mono">{po.invoicedQty.toString()}</td>
                <td>{po.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
