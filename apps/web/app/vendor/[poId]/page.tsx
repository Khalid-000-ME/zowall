import { notFound } from "next/navigation";
import { REASON_TEXT, formatUsdt } from "@zowall/gate-core";

import { Panel } from "@/components/Empty";
import { Hash } from "@/components/Hash";
import { OutcomeBadge } from "@/components/Outcome";
import { addressUrl, txUrl } from "@/lib/chains";
import { getDecisions, getPO } from "@/lib/chain";
import { serverEnv } from "@/lib/env";
import { describe } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * The vendor's view: what is reserved for them, and where their invoice stands,
 * in plain language.
 *
 * A vendor can see that funds are reserved against their purchase order before
 * they ship, without being given access to the buyer's books. Everything on this
 * page is public chain data, so nothing here needs a login.
 */
export default async function VendorPage({ params }: { params: Promise<{ poId: string }> }) {
  const { poId } = await params;
  const env = serverEnv();

  let id: bigint;
  try {
    id = BigInt(poId);
  } catch {
    notFound();
  }

  const po = await getPO(id);
  if (!po) notFound();

  const history = (await getDecisions()).filter((d) => d.poId === id);
  const latest = history.at(-1);
  const paid = history.reduce((sum, d) => sum + (d.paid ?? 0n), 0n);

  return (
    <div className="page" style={{ paddingBlock: "var(--space-7)", maxWidth: 680 }}>
      <p style={{ color: "var(--text-faint)", fontSize: 13, margin: 0 }}>Your purchase order</p>
      <h1 style={{ fontSize: 30 }}>#{po.id.toString()}</h1>
      <p style={{ color: "var(--text-muted)" }}>{describe(po.id) ?? "Purchase order"}</p>

      <div style={{ display: "grid", gap: "var(--space-4)", marginTop: "var(--space-5)" }}>
        <Panel title="What is agreed">
          <p style={{ margin: 0 }} className="mono">
            {po.qty.toString()} × {formatUsdt(po.unitPrice)} USDT ={" "}
            {formatUsdt(po.qty * po.unitPrice)} USDT
          </p>
          <p style={{ marginBottom: 0, color: "var(--text-muted)", fontSize: 14 }}>
            Price tolerance {po.priceTolBps / 100}%. Payment goes to{" "}
            <Hash value={po.payee} href={addressUrl(env.chainId, po.payee)} />.
          </p>
        </Panel>

        <Panel title="Reserved for you">
          <p style={{ margin: 0 }} className="mono">
            {formatUsdt(po.encumbered)} USDT
          </p>
          <p style={{ marginBottom: 0, color: "var(--text-muted)", fontSize: 14 }}>
            Held by the contract against this order right now. {formatUsdt(paid)} USDT has
            already been paid.
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
              <Hash value={latest.txHash} href={txUrl(env.chainId, latest.txHash)} />
            </div>
          ) : (
            <p style={{ margin: 0, color: "var(--text-muted)" }}>
              No invoice yet. {po.received.toString()} of {po.qty.toString()} recorded as received.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
