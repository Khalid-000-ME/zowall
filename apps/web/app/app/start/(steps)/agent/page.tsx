import Link from "next/link";

import { ConnectTabs } from "@/components/product/ConnectTabs";
import { CopyField } from "@/components/product/CopyField";
import { serverEnv } from "@/lib/env";
import { workspaceState } from "@/lib/product";

export const dynamic = "force-dynamic";

const seen = (unix: number) =>
  new Date(unix * 1000).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export default async function AgentStep() {
  const state = await workspaceState();
  const env = serverEnv();
  const last = state.decisions.at(-1);

  const gate = env.gateAddress ?? "0xYOUR_GATE";

  const sdkSnippet = `import { createGate } from "@zowall/sdk";

const gate = createGate({
  gateAddress: "${gate}",
  publicClient,   // viem, Whitechain Sepolia (chain ${env.chainId})
  walletClient,   // your agent's existing wallet
});

// Where your agent used to call transfer(), it calls this.
const decision = await gate.pay(invoice, vendorSignature);

if (decision.outcome !== "PAID") {
  // Nothing moved. decision.codes says exactly why.
  log(decision.reason);
}`;

  const x402Snippet = `GET /api/x402/resource
# No PAYMENT-SIGNATURE yet, so the server quotes in a PAYMENT-REQUIRED header:

HTTP/1.1 402 Payment Required
{
  "x402Version": 2,
  "resource": { "url": "/api/x402/resource" },
  "accepts": [{
    "scheme": "exact",
    "network": "hedera:testnet",
    "amount": "10000",
    "asset": "0.0.0",
    "payTo": "0.0.11338868",
    "extra": { "feePayer": "0.0.9185802" }
  }]
}

# The agent pays, retries with PAYMENT-SIGNATURE, and a facilitator
# verifies and settles on Hedera before the server answers.`;

  return (
    <>
      <div className="ui-split">
        <div>
          <h1 className="ui-title">Agent</h1>
          <p className="ui-lede">
            Your agent keeps its own keys, its own model and its own logic. One call changes: the
            one that used to move money. It now asks the gate, and the gate answers with a decision
            rather than an opinion.
          </p>
          <p className="ui-lede">
            Nothing here grants the agent an allowance. It cannot pay an invoice that has no
            matching order, however convincingly it is asked to.
          </p>
        </div>

        <div style={{ display: "grid", gap: "var(--space-5)" }}>
          <div className={state.decisions.length > 0 ? "ui-panel" : "ui-panel ui-panel--sunken"}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "var(--space-4)",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h3 className="ui-tile-title">Connection</h3>
                <p className="ui-tile-body" style={{ marginTop: 5 }}>
                  {state.decisions.length > 0
                    ? `${state.decisions.length} decision${
                        state.decisions.length === 1 ? "" : "s"
                      } so far. Last seen ${last ? seen(last.timestamp) : "—"}.`
                    : "The gate has not been called yet. It will show up here the moment it is."}
                </p>
              </div>
              <span
                className={state.decisions.length > 0 ? "ui-chip ui-chip--ok" : "ui-chip"}
              >
                <span className="ui-dot" />
                {state.decisions.length > 0 ? "Live" : "Waiting"}
              </span>
            </div>
          </div>

          <div className="ui-panel">
            <h3 className="ui-tile-title">What your agent needs</h3>
            <div style={{ display: "grid", gap: "var(--space-4)", marginTop: "var(--space-4)" }}>
              <CopyField label="Gate address" value={gate} />
              <CopyField label="Chain id" value={String(env.chainId)} />
              <CopyField label="RPC" value={env.rpcUrl} />
            </div>
          </div>
        </div>
      </div>

      <section className="ui-section">
        <h2 className="ui-title">Two ways in</h2>
        <p className="ui-lede">
          Use the SDK when the agent is the buyer and holds the wallet. Use the metered endpoint
          when something outside your system wants to know whether an invoice would clear.
        </p>
        <div style={{ marginTop: "var(--space-5)" }}>
          <ConnectTabs sdk={sdkSnippet} x402={x402Snippet} />
        </div>
      </section>

      <section className="ui-section">
        <div className="ui-split">
          <div>
            <h2 className="ui-title">What the gate returns</h2>
            <p className="ui-lede">
              Three outcomes, and never an exception because a document was wrong. A refusal is an
              answer, not a crash.
            </p>
          </div>
          <div className="ui-tiles">
            <div className="ui-tile">
              <h3 className="ui-tile-title">
                <span className="ui-chip ui-chip--ok">PAID</span>
              </h3>
              <p className="ui-tile-body">
                The invoice matched the order and the receipt. USDT moved in the same transaction.
              </p>
            </div>
            <div className="ui-tile">
              <h3 className="ui-tile-title">
                <span className="ui-chip ui-chip--held">HELD</span>
              </h3>
              <p className="ui-tile-body">
                Close, but a human should look. It waits in Exceptions for someone who is not the
                buyer or the receiver.
              </p>
            </div>
            <div className="ui-tile">
              <h3 className="ui-tile-title">
                <span className="ui-chip ui-chip--bad">REFUSED</span>
              </h3>
              <p className="ui-tile-body">
                A hard rule broke. No money moved, and the refusal is on-chain with every code that
                failed.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="ui-actions" style={{ marginTop: "var(--space-6)" }}>
        <Link href="/app/start/rules" className="ui-btn ui-btn--primary">
          Next: Rules
        </Link>
        <Link href="/app/start/vault" className="ui-btn">
          Back
        </Link>
      </div>
    </>
  );
}
