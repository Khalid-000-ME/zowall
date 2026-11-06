import Link from "next/link";

import { CopyField } from "@/components/product/CopyField";
import { X402Console } from "@/components/product/X402Console";
import { getPOs, type ChainPO } from "@/lib/chain";
import { addressUrl } from "@/lib/chains";
import { serverEnv } from "@/lib/env";
import { nameOf } from "@/lib/humans";
import { usdt } from "@/lib/product";
import { mandateSpecHash, RESOURCE_PATH, SCENARIOS } from "@/lib/x402-demo";

export const dynamic = "force-dynamic";

const SNIPPET = `import { createGuard, withZowall } from "@zowall/x402";

// Your x402 client is unchanged. This wraps the fetch it uses.
const guarded = withZowall({
  guard: createGuard({ keccak256, findMandate, roles }),
  signPayment,          // only ever called for a quote that passed
});

// Anything that is not a 402 passes straight through.
const res = await guarded("https://api.example.com/premium");`;

export default async function Metered() {
  const env = serverEnv();

  let pos: ChainPO[] = [];
  let reachable = true;
  try {
    pos = await getPOs();
  } catch {
    reachable = false;
  }

  // The mandate is found the same way the middleware finds it: by hashing the
  // resource URL and matching a purchase order's spec.
  const resource = `${RESOURCE_PATH}`;
  const specHash = mandateSpecHash(`http://localhost:3000${RESOURCE_PATH}`);
  const mandate = pos.find(
    (p) => p.status === "Open" && p.specHash.toLowerCase() === specHash.toLowerCase(),
  );

  return (
    <>
      <header>
        <p className="ui-eyebrow">Connect</p>
        <h1 className="ui-display">Metered spend</h1>
        <p className="ui-lede">
          x402 answers how a machine pays. It is silent on whether this machine should be paying
          this, to this address, at this price, again. That is the question a finance team has
          asked for a century, and the one an agent with a wallet cannot answer for itself.
        </p>
        <p className="ui-lede">
          The middleware wraps your agent&rsquo;s fetch. Every 402 it sees is matched against a
          mandate a person signed before the wallet is ever asked to authorise anything.
        </p>
      </header>

      <section className="ui-section">
        <div className="ui-split">
          <div>
            <h2 className="ui-title">A 402 is an invoice</h2>
            <p className="ui-lede">
              It names a payee, a price and a thing being sold, and it asks to be paid. The only
              reason it was never treated as one is that there was nothing to compare it against.
            </p>
          </div>
          <ul className="ui-numlist">
            <li className="ui-numrow">
              <span className="ui-numrow-n">01</span>
              <span className="ui-numrow-label">payTo becomes the payee</span>
              <span className="ui-numrow-sub">
                An endpoint that asks to be paid somewhere else is a PAYEE_MISMATCH.
              </span>
            </li>
            <li className="ui-numrow">
              <span className="ui-numrow-n">02</span>
              <span className="ui-numrow-label">maxAmountRequired becomes the unit price</span>
              <span className="ui-numrow-sub">
                A price raised after the mandate was signed is PRICE_OVER_TOLERANCE.
              </span>
            </li>
            <li className="ui-numrow">
              <span className="ui-numrow-n">03</span>
              <span className="ui-numrow-label">resource decides which mandate applies</span>
              <span className="ui-numrow-sub">
                No open order for that URL and the answer is NO_PO, before any payment is signed.
              </span>
            </li>
            <li className="ui-numrow">
              <span className="ui-numrow-n">04</span>
              <span className="ui-numrow-label">one call is one unit</span>
              <span className="ui-numrow-sub">
                Past the call count a person pre-authorised, it is QTY_OVER_RECEIVED.
              </span>
            </li>
          </ul>
        </div>
      </section>

      <section className="ui-section">
        <div className="ui-split">
          <div>
            <h2 className="ui-title">The mandate</h2>
            <p className="ui-lede">
              Not a config file. A purchase order on Whitechain, raised by a verified person, whose
              spec is the endpoint URL. The middleware finds it by hashing the URL it was asked to
              pay.
            </p>
          </div>

          <div style={{ display: "grid", gap: "var(--space-4)" }}>
            {mandate ? (
              <div className="ui-panel">
                <div className="ui-row">
                  <span className="ui-muted">Order</span>
                  <span className="ui-mono">#{mandate.id.toString()}</span>
                </div>
                <div className="ui-row">
                  <span className="ui-muted">Raised by</span>
                  <span>{nameOf(mandate.creatorPersonId)}</span>
                </div>
                <div className="ui-row">
                  <span className="ui-muted">Calls authorised</span>
                  <span className="ui-mono">
                    {mandate.invoicedQty.toString()} used of {mandate.received.toString()} signed
                    for
                  </span>
                </div>
                <div className="ui-row">
                  <span className="ui-muted">Agreed price</span>
                  <span className="ui-mono">
                    {usdt(mandate.unitPrice)} per call · {mandate.priceTolBps / 100}% tolerance
                  </span>
                </div>
                <div className="ui-row">
                  <span className="ui-muted">Reserved</span>
                  <span className="ui-mono">{usdt(mandate.encumbered)}</span>
                </div>
                {env.gateAddress ? (
                  <p style={{ marginTop: "var(--space-4)", marginBottom: 0 }}>
                    <a
                      href={addressUrl(env.chainId, env.gateAddress) ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="ui-numrow-note"
                    >
                      Open the gate on the explorer →
                    </a>
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="ui-note ui-note--warn">
                No open mandate covers <span className="ui-mono">{resource}</span>
                {!reachable ? " (and the node did not answer)" : ""}. Every scenario below will
                refuse with NO_PO, which is the correct answer and also the least interesting one.
                Raise an order whose description is the full resource URL to authorise it.
              </div>
            )}

            <div className="ui-panel ui-panel--sunken">
              <h3 className="ui-tile-title">How a mandate is written</h3>
              <p className="ui-tile-body" style={{ marginTop: 6, marginBottom: "var(--space-4)" }}>
                Raise an order in <Link href="/app/orders">Orders</Link> with the endpoint URL as
                its description, the number of calls as the quantity, and the price per call as the
                unit price. A second person signs for that call count before the agent may spend.
              </p>
              <CopyField label="Description to use" value={`http://localhost:3000${RESOURCE_PATH}`} />
            </div>
          </div>
        </div>
      </section>

      <section className="ui-section">
        <h2 className="ui-title">Try to get a payment through</h2>
        <p className="ui-lede">
          Each of these is something an unguarded agent pays without hesitating. The line to watch
          is whether the wallet was asked to sign.
        </p>
        <div style={{ marginTop: "var(--space-5)" }}>
          <X402Console scenarios={[...SCENARIOS]} />
        </div>
      </section>

      <section className="ui-section">
        <div className="ui-split">
          <div>
            <h2 className="ui-title">Wiring it in</h2>
            <p className="ui-lede">
              One wrap. The middleware never holds a key: signing stays with your x402 client and
              is only ever reached by a quote that passed.
            </p>
          </div>
          <div>
            <pre className="ui-code">{SNIPPET}</pre>
            <div className="ui-note" style={{ marginTop: "var(--space-4)" }}>
              The endpoint these scenarios call is a local stand-in for a third-party x402 API. It
              speaks the protocol correctly and settles nothing: no money moves, and the settlement
              it reports is marked simulated.
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
