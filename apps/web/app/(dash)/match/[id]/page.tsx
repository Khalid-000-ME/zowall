import { notFound } from "next/navigation";
import { REASON_TEXT, formatUsdt, type ReasonCode } from "@zowall/gate-core";

import { Field, Panel } from "@/components/Empty";
import { Hash } from "@/components/Hash";
import { OutcomeBadge } from "@/components/Outcome";
import { serverEnv } from "@/lib/env";
import { addressUrl, txUrl } from "@/lib/chains";
import { decisions, purchaseOrders } from "@/lib/store";

/**
 * The three-pane match view: what was ordered, what arrived, what is being
 * billed, side by side, with the fields that disagree highlighted.
 *
 * The layout is the argument. Three columns of the same shape make a mismatch
 * a visual fact rather than a sentence someone has to read and believe.
 */
export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const env = serverEnv();

  let poId: bigint;
  try {
    poId = BigInt(id);
  } catch {
    notFound();
  }

  const po = purchaseOrders.get(poId);
  if (!po) notFound();

  const history = decisions.forPO(poId);
  const latest = history.at(-1);
  const codes = new Set<ReasonCode>(latest?.codes ?? []);

  const priceDisagrees = codes.has("PRICE_OVER_TOLERANCE");
  const qtyDisagrees = codes.has("QTY_OVER_RECEIVED") || codes.has("NO_RECEIPT");
  const payeeDisagrees = codes.has("PAYEE_MISMATCH");

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 30 }}>PO #{po.id.toString()}</h1>
        {latest ? <OutcomeBadge outcome={latest.outcome} large /> : null}
      </div>
      <p style={{ color: "var(--text-muted)", marginTop: "var(--space-2)" }}>{po.description}</p>

      {latest && latest.codes.length > 0 ? (
        <ul
          style={{
            listStyle: "none",
            padding: "var(--space-3) var(--space-4)",
            margin: "var(--space-4) 0",
            background: latest.outcome === "REJECTED" ? "var(--rejected-bg)" : "var(--held-bg)",
            color: latest.outcome === "REJECTED" ? "var(--rejected)" : "var(--held)",
            borderRadius: "var(--radius)",
            display: "grid",
            gap: 4,
          }}
        >
          {latest.codes.map((code) => (
            <li key={code}>
              <span className="mono" style={{ fontWeight: 600 }}>
                {code}
              </span>
              {"  "}
              {REASON_TEXT[code]}
            </li>
          ))}
        </ul>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "var(--space-4)",
          marginTop: "var(--space-5)",
        }}
      >
        <Panel title="Purchase order">
          <Field label="Quantity" value={po.qty.toString()} />
          <Field label="Unit price" value={`${formatUsdt(po.unitPrice)} USDT`} />
          <Field label="Price tolerance" value={`${po.priceTolBps / 100}%`} />
          <Field label="Total" value={`${formatUsdt(po.qty * po.unitPrice)} USDT`} />
          <Field
            label="Payee"
            value={<Hash value={po.payee} href={addressUrl(env.chainId, po.payee)} />}
          />
        </Panel>

        <Panel title="Goods receipt">
          <Field label="Received" value={po.received.toString()} disagrees={qtyDisagrees} />
          <Field
            label="Signed by"
            value={po.receiverPersonId ? "a verified human" : "nobody yet"}
            disagrees={!po.receiverPersonId}
          />
          <Field label="Deliverable" value={<Hash value={po.specHash} />} />
        </Panel>

        <Panel title="Vendor invoice">
          {latest ? (
            <>
              <Field label="Quantity" value={latest.qty.toString()} disagrees={qtyDisagrees} />
              <Field
                label="Unit price"
                value={`${formatUsdt(latest.unitPrice)} USDT`}
                disagrees={priceDisagrees}
              />
              <Field
                label="Total"
                value={`${formatUsdt(latest.qty * latest.unitPrice)} USDT`}
                disagrees={priceDisagrees || qtyDisagrees}
              />
              <Field
                label="Payee"
                value={<Hash value={po.payee} />}
                disagrees={payeeDisagrees}
              />
              <Field label="Invoice" value={<Hash value={latest.invoiceHash} />} />
            </>
          ) : (
            <p style={{ color: "var(--text-faint)", margin: 0 }}>No invoice submitted yet.</p>
          )}
        </Panel>
      </div>

      {history.length > 0 ? (
        <section style={{ marginTop: "var(--space-6)" }}>
          <h2 style={{ fontSize: 20, marginBottom: "var(--space-3)" }}>Every decision</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-faint)", fontSize: 12 }}>
                <th style={{ padding: "6px 0" }}>When</th>
                <th>Outcome</th>
                <th>Reasons</th>
                <th>Paid</th>
                <th>Proof</th>
              </tr>
            </thead>
            <tbody>
              {history.map((d) => (
                <tr key={d.invoiceHash + d.at} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="mono" style={{ padding: "8px 0" }}>
                    {new Date(d.at).toISOString().slice(11, 19)}
                  </td>
                  <td>
                    <OutcomeBadge outcome={d.outcome} />
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {d.codes.join(" ") || "—"}
                  </td>
                  <td className="mono">{formatUsdt(d.paid)}</td>
                  <td>
                    {d.txHash ? (
                      <Hash value={d.txHash} href={txUrl(env.chainId, d.txHash)} />
                    ) : (
                      <span style={{ color: "var(--text-faint)" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </>
  );
}
