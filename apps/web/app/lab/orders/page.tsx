import Link from "next/link";

import { getPOs, type ChainPO } from "@/lib/chain";
import { addressUrl } from "@/lib/chains";
import { serverEnv } from "@/lib/env";
import { NewOrder, SignDelivery } from "@/components/product/OrderActions";
import { humans, nameOf } from "@/lib/humans";
import { shortHex, usdt } from "@/lib/product";

export const dynamic = "force-dynamic";

const STATUS_CHIP: Record<ChainPO["status"], string> = {
  Open: "ui-chip ui-chip--ok",
  Closed: "ui-chip",
  Cancelled: "ui-chip ui-chip--bad",
};

export default async function Orders() {
  const env = serverEnv();

  let pos: ChainPO[] = [];
  let reachable = true;
  try {
    pos = await getPOs();
  } catch {
    reachable = false;
  }

  const open = pos.filter((p) => p.status === "Open");
  const people = humans().map((h) => ({ key: h.key, name: h.name }));

  return (
    <>
      <header>
        <p className="ui-eyebrow">Workspace</p>
        <h1 className="ui-display">Orders</h1>
        <p className="ui-lede">
          A purchase order is a promise with the money already set aside. Until one exists, there
          is nothing for an invoice to match and every payment is refused.
        </p>
      </header>

      {!reachable ? (
        <div className="ui-note ui-note--warn" style={{ marginTop: "var(--space-5)" }}>
          The Whitechain testnet node did not answer. This list may be incomplete.
        </div>
      ) : null}

      <section className="ui-section">
        <div className="ui-tiles">
          <div className="ui-tile">
            <span className="ui-stat-label">Open</span>
            <span className="ui-stat-value">{open.length}</span>
          </div>
          <div className="ui-tile">
            <span className="ui-stat-label">Reserved</span>
            <span className="ui-stat-value">
              {usdt(pos.reduce((s, p) => s + p.encumbered, 0n))}
            </span>
          </div>
          <div className="ui-tile">
            <span className="ui-stat-label">Invoiced</span>
            <span className="ui-stat-value">
              {usdt(pos.reduce((s, p) => s + p.invoicedValue, 0n))}
            </span>
          </div>
          <div className="ui-tile">
            <span className="ui-stat-label">All time</span>
            <span className="ui-stat-value">{pos.length}</span>
          </div>
        </div>
      </section>

      <section className="ui-section">
        <div className="ui-split">
          <div>
            <h2 className="ui-title">Raise an order</h2>
            <p className="ui-lede">
              Step one of every payment. Reserving the money first is what lets a vendor check, on-chain,
              that it is set aside before they ship.
            </p>
          </div>
          <NewOrder people={people} enabled={env.demoEnabled} />
        </div>
      </section>

      {open.length > 0 ? (
        <section className="ui-section">
          <div className="ui-split">
            <div>
              <h2 className="ui-title">Sign for a delivery</h2>
              <p className="ui-lede">
                A different person confirms the goods, or the calls, actually arrived. The one who
                raised the order is refused by the contract.
              </p>
            </div>
            <div style={{ display: "grid", gap: "var(--space-4)" }}>
              {open.map((po) => (
                <div key={po.id.toString()} className="ui-panel">
                  <div className="ui-row" style={{ paddingTop: 0 }}>
                    <span>
                      Order <span className="ui-mono">#{po.id.toString()}</span>
                      <span className="ui-faint">
                        {" "}
                        · raised by {nameOf(po.creatorPersonId)}
                      </span>
                    </span>
                    <span className="ui-mono">
                      {po.received.toString()} of {po.qty.toString()} received
                    </span>
                  </div>
                  <div style={{ paddingTop: "var(--space-3)" }}>
                    <SignDelivery
                      poId={po.id.toString()}
                      remaining={Number(po.qty - po.received)}
                      people={people}
                      enabled={env.demoEnabled}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="ui-section">
        {pos.length === 0 ? (
          <p className="ui-lede">
            No orders yet. One is raised by the person who will be held to it - the gate records
            who, so they cannot later approve their own exception.
          </p>
        ) : (
          <table className="ui-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Payee</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Reserved</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...pos].reverse().map((po) => (
                <tr key={po.id.toString()}>
                  <td>
                    <span className="ui-mono">#{po.id.toString()}</span>
                    <div className="ui-faint" style={{ fontSize: 12.5, marginTop: 3 }}>
                      raised by {nameOf(po.creatorPersonId)}
                    </div>
                  </td>
                  <td>
                    <a
                      href={addressUrl(env.chainId, po.payee) ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="ui-mono"
                    >
                      {shortHex(po.payee)}
                    </a>
                  </td>
                  <td className="ui-mono">
                    {po.invoicedQty.toString()}/{po.qty.toString()}
                    <div className="ui-faint" style={{ fontSize: 12.5, marginTop: 3 }}>
                      {po.received.toString()} received
                    </div>
                  </td>
                  <td className="ui-mono">{usdt(po.unitPrice)}</td>
                  <td className="ui-mono">{usdt(po.encumbered)}</td>
                  <td>
                    <span className={STATUS_CHIP[po.status]}>{po.status}</span>
                  </td>
                  <td>
                    <Link
                      href={`/vendor/${po.id.toString()}` as "/"}
                      className="ui-numrow-note"
                      target="_blank"
                    >
                      Vendor view →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
