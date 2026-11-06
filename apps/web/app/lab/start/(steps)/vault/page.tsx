import Link from "next/link";

import { CopyField } from "@/components/product/CopyField";
import { addressUrl } from "@/lib/chains";
import { serverEnv } from "@/lib/env";
import { usdt, workspaceState } from "@/lib/product";

export const dynamic = "force-dynamic";

export default async function VaultStep() {
  const state = await workspaceState();
  const env = serverEnv();
  const funded = state.vault !== null && state.vault.balance > 0n;

  return (
    <>
      <div className="ui-split">
        <div>
          <h1 className="ui-title">Vault</h1>
          <p className="ui-lede">
            The gate holds the money, so a purchase order can reserve against a balance that
            actually exists. Reserving is the whole point: a vendor can check on-chain that funds
            are set aside for their order before they ship, without being shown your books.
          </p>
          <p className="ui-lede">
            Send test USDT to the gate address. There is no withdraw function - money leaves only
            as a payment the rules approved.
          </p>
        </div>

        <div style={{ display: "grid", gap: "var(--space-5)" }}>
          <div className="ui-tiles">
            <div className="ui-tile">
              <span className="ui-stat-label">Balance</span>
              <span className="ui-stat-value">{state.vault ? usdt(state.vault.balance) : "—"}</span>
            </div>
            <div className="ui-tile">
              <span className="ui-stat-label">Reserved</span>
              <span className="ui-stat-value">
                {state.vault ? usdt(state.vault.encumbered) : "—"}
              </span>
            </div>
            <div className="ui-tile">
              <span className="ui-stat-label">Free</span>
              <span className="ui-stat-value">{state.vault ? usdt(state.vault.free) : "—"}</span>
            </div>
          </div>

          {!state.chainReachable ? (
            <div className="ui-note ui-note--warn">
              The Whitechain testnet node did not answer, so the balance above may be stale. The
              endpoint returns intermittent 503s; reloading usually clears it.
            </div>
          ) : funded ? (
            <div className="ui-note">The vault holds a balance. This step is done.</div>
          ) : (
            <div className="ui-note ui-note--warn">
              The vault is empty. Every invoice will be refused for want of a reservation until it
              is funded.
            </div>
          )}

          <div className="ui-panel">
            <h3 className="ui-tile-title">Where to send it</h3>
            <div style={{ display: "grid", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
              <CopyField label="Gate address" value={env.gateAddress ?? "not configured"} />
              <CopyField label="USDT token (6 decimals)" value={env.usdtAddress ?? "not configured"} />
              <CopyField label="Network" value={`Whitechain Sepolia · chain id ${env.chainId}`} />
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
        </div>
      </div>

      <section className="ui-section">
        <div className="ui-split">
          <div>
            <h2 className="ui-title">What reserving means</h2>
            <p className="ui-lede">
              Three behaviours that are easy to get wrong, and that this vault gets right.
            </p>
          </div>
          <ul className="ui-numlist">
            <li className="ui-numrow">
              <span className="ui-numrow-n">01</span>
              <span className="ui-numrow-label">An order reserves the tolerance ceiling</span>
              <span className="ui-numrow-sub">
                Not the headline total. A 5% tolerance means an invoice at 42 against an order of 40
                is legitimate, and reserving only 40 would refuse an invoice the rules just approved.
              </span>
            </li>
            <li className="ui-numrow">
              <span className="ui-numrow-n">02</span>
              <span className="ui-numrow-label">An override draws from free balance only</span>
              <span className="ui-numrow-sub">
                Approving a variance that costs more than was reserved amends the order. The
                shortfall can never come out of another order&rsquo;s reservation.
              </span>
            </li>
            <li className="ui-numrow">
              <span className="ui-numrow-n">03</span>
              <span className="ui-numrow-label">There is no withdraw function</span>
              <span className="ui-numrow-sub">
                Money leaves on a matched invoice or when an order is cancelled and its reservation
                released. Nothing else moves it.
              </span>
            </li>
          </ul>
        </div>
      </section>

      <div className="ui-actions" style={{ marginTop: "var(--space-6)" }}>
        <Link href="/lab/start/agent" className="ui-btn ui-btn--primary">
          Next: Agent
        </Link>
        <Link href="/lab/start/people" className="ui-btn">
          Back
        </Link>
      </div>
    </>
  );
}
