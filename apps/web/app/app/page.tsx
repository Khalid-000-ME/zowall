import Link from "next/link";

import { CodeBlock } from "@/components/docs/CodeBlock";
import { listKeys } from "@/lib/accounts";
import { endpointsOf } from "@/lib/registry";
import { requireAccount } from "@/lib/session";

export const dynamic = "force-dynamic";

function Step({ n, done, title, body, href, label }: { n: string; done: boolean; title: string; body: string; href: string; label: string }) {
  return (
    <li className="ui-numrow">
      <span className="ui-numrow-n">{n}</span>
      <span className="ui-numrow-label">{title}</span>
      <span className="ui-numrow-note">
        {done ? <span className="ui-chip ui-chip--ok">Done</span> : <Link href={href as "/app"}>{label} →</Link>}
      </span>
      <span className="ui-numrow-sub">{body}</span>
    </li>
  );
}

const VENDOR_SNIPPET = `import { registerEndpoint } from "@zowall/sdk";

const endpoint = await registerEndpoint(
  { baseUrl: process.env.ZOWALL_URL, apiKey: process.env.ZOWALL_API_KEY },
  {
    name: "Forecast",
    url: "https://api.example.com/forecast",
    payTo: "0.0.1234",          // the account your 402 quote pays
    amount: "10000",            // atomic units per call (10000 tinybars = 0.0001 HBAR)
  },
);

console.log(endpoint.status);   // "verified" once your 402 matches`;

const BUYER_SNIPPET = `import { discoverEndpoints } from "@zowall/sdk";
import { createGuard, withZowall } from "@zowall/x402";

// 1. Find what you can pay for. Discovery needs no key.
const { endpoints } = await discoverEndpoints({ baseUrl: process.env.ZOWALL_URL }, { q: "forecast" });

// 2. Wrap your agent's fetch. Every 402 is checked before anything is signed.
const guarded = withZowall({
  guard: createGuard({ keccak256, findMandate, roles }),
  signPayment,
});

const response = await guarded(endpoints[0].url);`;

export default async function Overview() {
  const account = await requireAccount();
  const keys = listKeys(account.id).filter((k) => !k.revokedAt);

  if (account.role === "vendor") {
    const endpoints = endpointsOf(account.id);
    const verified = endpoints.filter((e) => e.status === "verified");

    return (
      <>
        <header>
          <p className="ui-eyebrow">Selling</p>
          <h1 className="ui-display">Welcome, {account.name}.</h1>
          <p className="ui-lede">Three steps to get an x402 endpoint in front of agents that can pay for it.</p>
        </header>

        <section className="ui-section">
          <ul className="ui-numlist">
            <Step n="01" done={endpoints.length > 0} title="Register an endpoint" body="Give us its URL, its price and the account it pays." href="/app/endpoints" label="Register" />
            <Step n="02" done={verified.length > 0} title="Get it verified" body="We call it once with no payment and check its 402 matches what you registered." href="/app/endpoints" label="Check" />
            <Step n="03" done={keys.length > 0} title="Use your API key" body="Register and manage endpoints from your own code with the SDK." href="/app/keys" label="Keys" />
          </ul>
        </section>

        <section className="ui-section">
          <div className="ui-tiles">
            <div className="ui-tile">
              <span className="ui-stat-label">Endpoints</span>
              <span className="ui-stat-value">{endpoints.length}</span>
            </div>
            <div className="ui-tile">
              <span className="ui-stat-label">Verified</span>
              <span className="ui-stat-value">{verified.length}</span>
            </div>
            <div className="ui-tile">
              <span className="ui-stat-label">Active keys</span>
              <span className="ui-stat-value">{keys.length}</span>
            </div>
          </div>
        </section>

        <section className="ui-section">
          <div className="ui-split">
            <div>
              <h2 className="ui-title">Or from code</h2>
              <p className="ui-lede">
                The same registration, with the SDK. See the <Link href="/docs">docs</Link> for the rest.
              </p>
            </div>
            <CodeBlock code={VENDOR_SNIPPET} />
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <header>
        <p className="ui-eyebrow">Buying</p>
        <h1 className="ui-display">Welcome, {account.name}.</h1>
        <p className="ui-lede">Three steps to let an agent find an endpoint and pay for it.</p>
      </header>

      <section className="ui-section">
        <ul className="ui-numlist">
          <Step n="01" done={keys.length > 0} title="Keep your API key" body="Your key identifies your agents to the platform. Create another any time." href="/app/keys" label="Keys" />
          <Step n="02" done={false} title="Find an endpoint" body="Browse what has been verified, its price, and who it pays." href="/registry" label="Browse" />
          <Step n="03" done={false} title="Pay with the SDK" body="Wrap your agent's fetch so every 402 is checked before it is paid." href="/docs" label="Read the docs" />
        </ul>
      </section>

      <section className="ui-section">
        <div className="ui-split">
          <div>
            <h2 className="ui-title">In code</h2>
            <p className="ui-lede">Discover endpoints, then pay for one.</p>
          </div>
          <CodeBlock code={BUYER_SNIPPET} />
        </div>
      </section>
    </>
  );
}
