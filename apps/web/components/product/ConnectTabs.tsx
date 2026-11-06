"use client";

import { useState } from "react";

type Tab = "sdk" | "x402";

const LABEL: Record<Tab, { title: string; note: string }> = {
  sdk: { title: "SDK", note: "Your agent holds the wallet and pays." },
  x402: { title: "x402 endpoint", note: "Someone else pays per question." },
};

/**
 * The two integrations, as tabs rather than two stacked code blocks: an
 * engineer needs one of them, and showing both at once is how a quick-start
 * turns into a page nobody reads to the end of.
 */
export function ConnectTabs({ sdk, x402 }: { sdk: string; x402: string }) {
  const [tab, setTab] = useState<Tab>("sdk");

  return (
    <div>
      <div className="ui-tabs" role="tablist">
        {(["sdk", "x402"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            aria-current={tab === t ? "page" : undefined}
            onClick={() => setTab(t)}
            className="ui-tab"
          >
            {LABEL[t].title}
          </button>
        ))}
      </div>

      <p className="ui-tile-body" style={{ margin: "var(--space-4) 0" }}>
        {LABEL[tab].note}
      </p>

      <pre className="ui-code">{tab === "sdk" ? sdk : x402}</pre>

      {tab === "x402" ? (
        <p className="ui-tile-body" style={{ marginTop: "var(--space-3)" }}>
          The quote above is live from this server. No paid request has settled through the
          facilitator yet.
        </p>
      ) : null}
    </div>
  );
}
