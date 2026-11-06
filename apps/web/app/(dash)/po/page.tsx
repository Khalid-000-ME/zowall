import Link from "next/link";
import { formatUsdt } from "@zowall/gate-core";

import { Empty } from "@/components/Empty";
import { VaultStrip } from "@/components/VaultStrip";
import { getPOs } from "@/lib/chain";
import { serverEnv } from "@/lib/env";
import { describe } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function PurchaseOrdersPage() {
  const env = serverEnv();

  let pos: Awaited<ReturnType<typeof getPOs>> = [];
  let error: string | null = null;
  if (env.gateAddress) {
    try {
      pos = await getPOs();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "var(--space-5)",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <h1 style={{ fontSize: 30 }}>Purchase orders</h1>
        <span style={{ display: "inline-flex", gap: 8 }}>
          <Link
            href="/po/new"
            style={{
              border: "1px solid var(--border-strong)",
              padding: "8px 16px",
              borderRadius: "var(--radius-sm)",
              textDecoration: "none",
              fontSize: 14,
            }}
          >
            New order
          </Link>
          <Link
          href="/walkthrough"
          style={{
            background: "var(--accent)",
            color: "var(--accent-text)",
            padding: "8px 16px",
            borderRadius: "var(--radius-sm)",
            textDecoration: "none",
            fontSize: 14,
          }}
        >
          Walk through it
          </Link>
        </span>
      </div>

      <VaultStrip />

      <div style={{ height: "var(--space-5)" }} />

      {error ? (
        <p style={{ color: "var(--rejected)" }}>Could not read the chain: {error}</p>
      ) : pos.length === 0 ? (
        <Empty title="No purchase orders yet. Raise one to reserve funds against it." />
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-faint)", fontSize: 12 }}>
                <th style={{ padding: "8px 0" }}>PO</th>
                <th>For</th>
                <th>Ordered</th>
                <th>Received</th>
                <th>Invoiced</th>
                <th>Reserved</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pos.map((po) => (
                <tr key={po.id.toString()} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "10px 0" }}>
                    <Link href={`/match/${po.id}`} className="mono">
                      #{po.id.toString()}
                    </Link>
                  </td>
                  <td>{describe(po.id) ?? <span style={{ color: "var(--text-faint)" }}>—</span>}</td>
                  <td className="mono">
                    {po.qty.toString()} @ {formatUsdt(po.unitPrice)}
                  </td>
                  <td className="mono">{po.received.toString()}</td>
                  <td className="mono">{po.invoicedQty.toString()}</td>
                  <td className="mono">{formatUsdt(po.encumbered)}</td>
                  <td>{po.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
