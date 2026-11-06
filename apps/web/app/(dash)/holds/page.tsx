import Link from "next/link";
import { REASON_TEXT, formatUsdt } from "@zowall/gate-core";

import { Empty } from "@/components/Empty";
import { HoldActions } from "@/components/HoldActions";
import { getOpenHolds, getPO } from "@/lib/chain";
import { hashscanTopic } from "@/lib/chains";
import { serverEnv } from "@/lib/env";
import { nameOf } from "@/lib/humans";
import { describe } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * The exception queue. Every row needs a different human to clear it than the
 * one who raised the PO or signed for the delivery - which the contract
 * enforces, so this page only has to explain it.
 */
export default async function HoldsPage() {
  const env = serverEnv();

  let rows: Array<{
    hold: Awaited<ReturnType<typeof getOpenHolds>>[number];
    po: Awaited<ReturnType<typeof getPO>>;
  }> = [];
  let error: string | null = null;

  if (env.gateAddress) {
    try {
      const holds = await getOpenHolds();
      rows = await Promise.all(holds.map(async (hold) => ({ hold, po: await getPO(hold.poId) })));
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  return (
    <>
      <h1 style={{ fontSize: 30, marginBottom: "var(--space-2)" }}>Holds</h1>
      <p style={{ color: "var(--text-muted)", marginTop: 0, maxWidth: "var(--measure)" }}>
        Funds stay reserved. Releasing one needs a third person: not whoever raised the purchase
        order, not whoever signed for the delivery.
      </p>

      {error ? (
        <p style={{ color: "var(--rejected)" }}>Could not read the chain: {error}</p>
      ) : rows.length === 0 ? (
        <Empty title="Nothing waiting. Every invoice so far either matched or was refused outright." />
      ) : (
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "var(--space-3)" }}>
          {rows.map(({ hold, po }) => (
            <li
              key={hold.id.toString()}
              style={{
                border: "1px solid var(--border)",
                borderLeft: "3px solid var(--held)",
                borderRadius: "var(--radius)",
                padding: "var(--space-4)",
                background: "var(--surface)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <strong>
                  Hold #{hold.id.toString()} · PO #{hold.poId.toString()}
                  {po ? ` · ${describe(po.id) ?? "purchase order"}` : ""}
                </strong>
                <span className="mono">{formatUsdt(hold.qty * hold.unitPrice)} USDT</span>
              </div>
              <ul style={{ margin: "var(--space-3) 0", paddingLeft: "1.1rem" }}>
                {hold.codes.map((code) => (
                  <li key={code} style={{ color: "var(--text-muted)" }}>
                    {REASON_TEXT[code]}
                  </li>
                ))}
              </ul>
              {po ? (
                <p style={{ margin: "0 0 var(--space-3)", fontSize: 13, color: "var(--text-muted)" }}>
                  Cannot be cleared by {nameOf(po.creatorPersonId)} (raised it)
                  {po.receiverPersonId !== `0x${"00".repeat(32)}`
                    ? ` or ${nameOf(po.receiverPersonId)} (signed for it)`
                    : ""}
                  .
                </p>
              ) : null}
              <Link href={`/match/${hold.poId}`} style={{ fontSize: 14 }}>
                Compare the three documents
              </Link>
              <HoldActions
                holdId={hold.id.toString()}
                topicUrl={env.hederaTopicId ? hashscanTopic(env.hederaTopicId) : null}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
