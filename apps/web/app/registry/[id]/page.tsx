import Link from "next/link";
import { notFound } from "next/navigation";

import { CodeBlock } from "@/components/docs/CodeBlock";
import { ProofHash } from "@/components/product/ProofHash";
import { ago, formatPrice } from "@/lib/amounts";
import { getAccount } from "@/lib/accounts";
import { getEndpoint, visibleTo } from "@/lib/registry";
import { findMandate } from "@/lib/x402-demo";

export const dynamic = "force-dynamic";

export default async function EndpointPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = getEndpoint(id);
  if (!e || !visibleTo(e, null)) notFound();

  const merchant = getAccount(e.merchantId);
  const mandate = await findMandate(e.url).catch(() => null);
  const quote = e.verification?.quote ?? null;

  const CALL = `import { createGuard, withZowall } from "@zowall/x402";

const guarded = withZowall({
  guard: createGuard({ keccak256, findMandate, roles }),
  signPayment,
});

// ${e.name}: ${formatPrice(e.asset, e.amount)} per call
const response = await guarded("${e.url}");`;

  return (
    <>
      <p className="ui-eyebrow">
        <Link href="/registry" style={{ textDecoration: "none" }}>
          ← Registry
        </Link>
      </p>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap", alignItems: "start" }}>
        <div>
          <h1 className="ui-display" style={{ maxWidth: "22ch" }}>
            {e.name}
          </h1>
          <p className="ui-lede">{e.description || "No description."}</p>
        </div>
        <span className="ui-chip ui-chip--ok">
          <span className="ui-dot" />
          Verified {e.verification ? ago(e.verification.checkedAt) : ""}
        </span>
      </header>

      <section className="ui-section">
        <div className="ui-split">
          <div>
            <h2 className="ui-title">Terms</h2>
            <p className="ui-lede">
              Read from the endpoint&rsquo;s own 402 response when the platform called it, not from a form.
            </p>
          </div>
          <div className="ui-panel">
            <div className="ui-row">
              <span className="ui-muted">Price</span>
              <span className="ui-mono">
                {formatPrice(e.asset, e.amount)} per call
              </span>
            </div>
            <div className="ui-row">
              <span className="ui-muted">Paid to</span>
              <span className="ui-mono">{e.payTo}</span>
            </div>
            <div className="ui-row">
              <span className="ui-muted">Network</span>
              <span className="ui-mono">{e.network}</span>
            </div>
            <div className="ui-row">
              <span className="ui-muted">Protocol</span>
              <span className="ui-mono">{quote ? `x402 v${quote.version}` : "—"}</span>
            </div>
            {quote?.feePayer ? (
              <div className="ui-row">
                <span className="ui-muted">Fee payer</span>
                <span className="ui-mono">{quote.feePayer}</span>
              </div>
            ) : null}
            <div className="ui-row">
              <span className="ui-muted">Merchant</span>
              <span>{merchant?.name}</span>
            </div>
            <div className="ui-row">
              <span className="ui-muted">Resource</span>
              <span className="ui-mono" style={{ overflowWrap: "anywhere", textAlign: "right" }}>
                {e.url}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="ui-section">
        <div className="ui-split">
          <div>
            <h2 className="ui-title">Spend against it</h2>
            <p className="ui-lede">
              An agent pays this endpoint under a mandate: an order whose spec is its URL, raised by one person and
              signed for by another. Without one, the gate refuses.
            </p>
          </div>
          <div style={{ display: "grid", gap: "var(--space-4)", minWidth: 0 }}>
            <div className="ui-panel">
              <div className="ui-row">
                <span className="ui-muted">Mandate on this gate</span>
                {mandate ? (
                  <span className="ui-chip ui-chip--ok">
                    order #{mandate.id.toString()} · {(mandate.received - mandate.invoicedQty).toString()} calls left
                  </span>
                ) : (
                  <span className="ui-chip ui-chip--held">none open</span>
                )}
              </div>
              <div className="ui-row">
                <span className="ui-muted">Spec hash</span>
                <ProofHash value={e.specHash} href={null} lead={10} tail={8} />
              </div>
            </div>
            <CodeBlock code={CALL} label="Call it through the middleware" />
          </div>
        </div>
      </section>
    </>
  );
}
