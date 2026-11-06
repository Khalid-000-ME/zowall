import { notFound } from "next/navigation";
import { REASON_TEXT, formatUsdt, type ReasonCode } from "@zowall/gate-core";

import { Field, Panel } from "@/components/Empty";
import { Hash } from "@/components/Hash";
import { OutcomeBadge } from "@/components/Outcome";
import { addressUrl, hashscanTopic, txUrl } from "@/lib/chains";
import { getDecisions, getPO, invoiceFromTx } from "@/lib/chain";
import { serverEnv } from "@/lib/env";
import { nameOf } from "@/lib/humans";
import { getJournal } from "@/lib/journal-read";
import { describe } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * The three-pane match view: what was ordered, what arrived, what is being
 * billed, side by side, with the fields that disagree highlighted.
 *
 * The layout is the argument. Three columns of the same shape make a mismatch
 * a visual fact rather than a sentence someone has to read and believe. Every
 * number here is read off the chain, not out of this app's memory.
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

  const po = await getPO(poId);
  if (!po) notFound();

  const [all, journal] = await Promise.all([getDecisions(), getJournal()]);
  const history = all.filter((d) => d.poId === poId);
  const latest = history.at(-1);
  const invoice = latest ? await invoiceFromTx(latest.txHash) : null;
  const codes = new Set<ReasonCode>(latest?.codes ?? []);

  const priceDisagrees = codes.has("PRICE_OVER_TOLERANCE");
  const qtyDisagrees = codes.has("QTY_OVER_RECEIVED") || codes.has("NO_RECEIPT");
  const payeeDisagrees = codes.has("PAYEE_MISMATCH");
  const noReceiver = po.receiverPersonId === `0x${"00".repeat(32)}`;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 30 }}>PO #{po.id.toString()}</h1>
        {latest ? <OutcomeBadge outcome={latest.outcome} large /> : null}
        <span style={{ color: "var(--text-faint)", fontSize: 14 }}>{po.status}</span>
      </div>
      <p style={{ color: "var(--text-muted)", marginTop: "var(--space-2)" }}>
        {describe(po.id) ?? "Purchase order"} · raised by {nameOf(po.creatorPersonId)}
      </p>

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
          <Field label="Reserved" value={`${formatUsdt(po.encumbered)} USDT`} />
          <Field
            label="Payee"
            value={<Hash value={po.payee} href={addressUrl(env.chainId, po.payee)} />}
          />
        </Panel>

        <Panel title="Goods receipt">
          <Field label="Received" value={po.received.toString()} disagrees={qtyDisagrees} />
          <Field
            label="Signed for by"
            value={noReceiver ? "nobody yet" : nameOf(po.receiverPersonId)}
            disagrees={noReceiver}
          />
          <Field label="Invoiced so far" value={po.invoicedQty.toString()} />
        </Panel>

        <Panel title="Vendor invoice">
          {latest ? (
            <>
              <Field label="Quantity" value={latest.invQty.toString()} disagrees={qtyDisagrees} />
              <Field
                label="Unit price"
                value={`${formatUsdt(latest.invUnitPrice)} USDT`}
                disagrees={priceDisagrees}
              />
              <Field
                label="Total"
                value={`${formatUsdt(latest.invQty * latest.invUnitPrice)} USDT`}
                disagrees={priceDisagrees || qtyDisagrees}
              />
              <Field
                label="Pay to"
                value={
                  invoice ? (
                    <Hash value={invoice.payee} href={addressUrl(env.chainId, invoice.payee)} />
                  ) : (
                    "—"
                  )
                }
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
          <h2 style={{ fontSize: 20, marginBottom: "var(--space-1)" }}>Every decision</h2>
          <p style={{ color: "var(--text-muted)", marginTop: 0, fontSize: 14 }}>
            Each one is a transaction on Whitechain and an entry on Hedera, bound by the same
            digest.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-faint)", fontSize: 12 }}>
                  <th style={{ padding: "6px 0" }}>When</th>
                  <th>Outcome</th>
                  <th>Reasons</th>
                  <th>Paid</th>
                  <th>Whitechain</th>
                  <th>Hedera</th>
                </tr>
              </thead>
              <tbody>
                {history.map((d) => {
                  const entry = journal.byTx.get(d.txHash.toLowerCase());
                  const agrees = entry && entry.entry.dig.toLowerCase() === d.journalDigest.toLowerCase();
                  return (
                    <tr key={d.txHash} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="mono" style={{ padding: "8px 0" }}>
                        {new Date(d.timestamp * 1000).toISOString().slice(11, 19)}
                      </td>
                      <td>
                        <OutcomeBadge outcome={d.outcome} />
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {d.codes.join(" ") || "—"}
                      </td>
                      <td className="mono">{formatUsdt(d.paid ?? 0n)}</td>
                      <td>
                        <Hash value={d.txHash} href={txUrl(env.chainId, d.txHash)} />
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {entry && journal.topicId ? (
                          <a
                            href={hashscanTopic(journal.topicId)}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: agrees ? "var(--paid)" : "var(--rejected)" }}
                          >
                            #{entry.sequenceNumber} {agrees ? "digest matches" : "DIGEST DIFFERS"}
                          </a>
                        ) : (
                          <span style={{ color: "var(--text-faint)" }}>not journalled</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
