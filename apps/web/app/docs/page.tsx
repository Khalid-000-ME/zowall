import Link from "next/link";
import { REASON_CODES, REASON_TEXT, SEVERITY } from "@zowall/gate-core";

import { CodeBlock } from "@/components/docs/CodeBlock";
import { addressUrl } from "@/lib/chains";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/* ----------------------------------------------------------------- snippets -- */

const INSTALL = `# The packages are workspace packages in this repository. They are not on npm.
git clone <this repository> && cd zowall
pnpm install

# Use them from another package in the workspace:
pnpm --filter <your-package> add @zowall/sdk@workspace:* @zowall/x402@workspace:*`;

const KEY = `export ZOWALL_URL=https://your-zowall-host
export ZOWALL_API_KEY=sk_live_...        # from Dashboard > API keys. Keep it on your server.`;

const ANSWER_402 = `HTTP/1.1 402 Payment Required
PAYMENT-REQUIRED: <base64 of the JSON below>

{
  "x402Version": 2,
  "resource": { "url": "https://api.example.com/forecast" },
  "accepts": [{
    "scheme": "exact",
    "network": "hedera:testnet",
    "amount": "10000",              // atomic units per call
    "asset": "0.0.0",               // HBAR
    "payTo": "0.0.1234",            // the account you register as "paid to"
    "maxTimeoutSeconds": 60,
    "extra": { "feePayer": "<your facilitator's fee payer>" }
  }]
}`;

const REGISTER = `import { registerEndpoint } from "@zowall/sdk";

const config = { baseUrl: process.env.ZOWALL_URL!, apiKey: process.env.ZOWALL_API_KEY! };

const endpoint = await registerEndpoint(config, {
  name: "Forecast",
  url: "https://api.example.com/forecast",
  payTo: "0.0.1234",
  amount: "10000",                  // atomic units. toAtomic("0.0.0", "0.0001") gives "10000"
  description: "Hourly forecast for any city",
  tags: ["weather", "data"],
});

if (endpoint.status !== "verified") {
  // Saved, but not listed. Each reason is one sentence about what to fix.
  console.log(endpoint.verification?.reasons);
}`;

const VERIFY = `import { verifyEndpoint, myEndpoints } from "@zowall/sdk";

const { endpoints } = await myEndpoints(config);      // everything you registered, any state
await verifyEndpoint(config, endpoints[0].id);        // call it again after a fix`;

const CHECKOUT = `import { createCheckoutSession, signInvoice } from "@zowall/sdk";

// You sign an invoice as you always did...
const signature = await signInvoice(invoice, { privateKey: vendorKey, chainId: 1874, gateAddress });

// ...and ask for a checkout instead of handing the buyer a signature.
const { url } = await createCheckoutSession(config, {
  invoice,
  signature,
  description: "2 cables",
  successUrl: "https://shop.example/thanks",   // the session id is appended
  cancelUrl: "https://shop.example/cart",
});

redirect(url);                                   // send the buyer here`;

const DISCOVER = `import { discoverEndpoints } from "@zowall/sdk";

// Public. No key needed, and nothing is sent that identifies you.
const { total, endpoints } = await discoverEndpoints(
  { baseUrl: process.env.ZOWALL_URL! },
  { q: "forecast", tag: "weather", network: "hedera:testnet", limit: 20 },
);

for (const e of endpoints) console.log(e.name, e.url, e.amount, e.asset, e.payTo);`;

const PAY = `import { createGuard, withZowall } from "@zowall/x402";

const guarded = withZowall({
  // Checks every 402 against a mandate before anything is signed.
  guard: createGuard({ keccak256, findMandate, roles }),

  // Your x402 client still does the paying. It is only called for a quote that passed.
  signPayment: async (quote) => ({ payload: await buildPayload(quote) }),
});

// Anything that is not a 402 passes straight through.
const response = await guarded(endpoint.url);

// A refusal is a 402 carrying the reason codes. Nothing was signed.
if (response.status === 402) {
  const { zowall } = await response.json();
  console.log(zowall.outcome, zowall.codes);
}`;

const PAY_INVOICE = `import { createGate } from "@zowall/sdk";

const gate = createGate({ gateAddress, publicClient, walletClient });

const preview = await gate.preview(invoice, signature);   // changes nothing, costs no gas
const result = await gate.pay(invoice, signature);        // never throws on a bad document

if (result.outcome === "PAID")     { /* USDT moved to the payee, in this transaction */ }
if (result.outcome === "HELD")     { /* parked for a person to approve */ }
if (result.outcome === "REJECTED") { /* nothing moved. result.codes lists every reason */ }`;

/* ------------------------------------------------------------------- pieces -- */

function Step({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="ui-section" style={{ scrollMarginTop: 24 }}>
      <div className="ui-split">
        <div>
          <p className="ui-eyebrow">{eyebrow}</p>
          <h2 className="ui-title">{title}</h2>
        </div>
        <div style={{ display: "grid", gap: "var(--space-4)", minWidth: 0 }}>{children}</div>
      </div>
    </section>
  );
}

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="ui-lede" style={{ margin: 0 }}>
    {children}
  </p>
);

/* --------------------------------------------------------------------- page -- */

export default function Docs() {
  const env = serverEnv();
  const gate = env.gateAddress;

  return (
    <>
      <header id="overview" style={{ scrollMarginTop: 24 }}>
        <p className="ui-eyebrow">Docs</p>
        <h1 className="ui-display">Sell to agents. Buy for agents.</h1>
        <p className="ui-lede">
          Zowall is a payments platform for x402. Vendors register the endpoints they sell and are verified before
          they are listed. Buyers get an API key, discover what they can pay for, and pay through a guard that checks
          every quote first.
        </p>
        <div className="ui-actions" style={{ marginTop: "var(--space-5)" }}>
          <Link href="/signup?role=vendor" className="ui-btn ui-btn--primary">
            Start selling
          </Link>
          <Link href="/signup?role=buyer" className="ui-btn">
            Start buying
          </Link>
        </div>
      </header>

      <Step id="install" eyebrow="Start" title="Install the SDK">
        <P>
          <code>@zowall/sdk</code> and <code>@zowall/x402</code> are workspace packages in this repository. They are
          not published to npm, so use them from inside the workspace or copy <code>packages/sdk</code>,{" "}
          <code>packages/x402</code> and <code>packages/gate-core</code> into your project.
        </P>
        <CodeBlock code={INSTALL} />
      </Step>

      <Step id="keys" eyebrow="Start" title="API keys">
        <P>
          Create an account as a vendor or a buyer, and you get a key straight away. It is shown once, and only a hash
          of it is kept. Create more, or revoke one, under <Link href="/app/keys">API keys</Link>. Send it as{" "}
          <code>Authorization: Bearer &lt;key&gt;</code>, or pass it to the SDK.
        </P>
        <CodeBlock code={KEY} />
        <P>
          Keep keys on your server. A vendor key can register endpoints and create checkout sessions. A buyer key
          identifies your agents to the platform.
        </P>
      </Step>

      {/* -------------------------------------------------------------------- sell -- */}
      <Step id="sell" eyebrow="Sell" title="Register an endpoint">
        <P>
          In the dashboard, open <Link href="/app/endpoints">Endpoints</Link> and fill in the form. Or do the same from
          code. We call your endpoint once, with no payment, and check that its own 402 names the payee and price you
          registered. That is also how we know it is yours: another vendor&rsquo;s URL registered against your account
          will name theirs.
        </P>
        <CodeBlock code={REGISTER} label="Register" />
        <P>It is saved either way. A failing endpoint is not listed, and says why. Fix it, then check again:</P>
        <CodeBlock code={VERIFY} />
      </Step>

      <Step id="sell-402" eyebrow="Sell" title="Answer 402">
        <P>
          The only thing your endpoint has to do is answer an unpaid request with an x402 quote. Zowall reads v2 (a base64{" "}
          <code>PAYMENT-REQUIRED</code> header) and the older v1 (a JSON body with <code>maxAmountRequired</code>).
        </P>
        <CodeBlock code={ANSWER_402} />
        <P>
          Three things must match what you registered: <code>payTo</code>, <code>amount</code> and the resource URL.
          The network must offer the <code>exact</code> scheme.
        </P>
      </Step>

      <Step id="sell-checkout" eyebrow="Sell" title="Hosted checkout">
        <P>
          To bill a buyer for an invoice, create a checkout session and redirect them to it. The page shows what is
          being paid and the checks the gate has already run, and takes the payment. You never touch the buyer&rsquo;s
          funds.
        </P>
        <CodeBlock code={CHECKOUT} />
      </Step>

      {/* --------------------------------------------------------------------- buy -- */}
      <Step id="buy" eyebrow="Buy" title="Discover endpoints">
        <P>
          Browse the <Link href="/registry">registry</Link>, or query it from your agent. Discovery is public and lists
          only endpoints that are verified.
        </P>
        <CodeBlock code={DISCOVER} />
      </Step>

      <Step id="buy-pay" eyebrow="Buy" title="Pay with x402">
        <P>
          Wrap your agent&rsquo;s <code>fetch</code>. Each 402 is matched against a mandate you set, so an agent can
          only pay what a person agreed it could, to the account that was agreed. Your existing x402 client does the
          signing.
        </P>
        <CodeBlock code={PAY} />
      </Step>

      <Step id="buy-invoice" eyebrow="Buy" title="Pay an invoice">
        <P>
          For invoices from a vendor, use the gate. Preview first, then pay. A refusal comes back as a result, not an
          exception, and every failing reason is listed.
        </P>
        <CodeBlock code={PAY_INVOICE} />
        <table className="ui-table">
          <thead>
            <tr>
              <th>Outcome</th>
              <th>What to do</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <span className="ui-chip ui-chip--ok">PAID</span>
              </td>
              <td>Record <code>txHash</code> and carry on.</td>
            </tr>
            <tr>
              <td>
                <span className="ui-chip ui-chip--held">HELD</span>
              </td>
              <td>Do not resubmit. A person decides it; funds stay reserved.</td>
            </tr>
            <tr>
              <td>
                <span className="ui-chip ui-chip--bad">REJECTED</span>
              </td>
              <td>Stop. Read <code>result.codes</code>. The vendor re-signs a corrected invoice.</td>
            </tr>
          </tbody>
        </table>
      </Step>

      {/* --------------------------------------------------------------- reference -- */}
      <Step id="api" eyebrow="Reference" title="Registry API">
        <table className="ui-table">
          <thead>
            <tr>
              <th>Call</th>
              <th>Key</th>
              <th>Does</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["GET /api/registry/endpoints", "none", "List verified, public endpoints. Filters: q, tag, network, asset, limit, offset."],
              ["GET /api/registry/endpoints?mine=1", "vendor", "List everything you registered, in any state."],
              ["GET /api/registry/endpoints/:id", "none", "One endpoint. Private ones are visible only to their vendor."],
              ["POST /api/registry/endpoints", "vendor", "Register and verify an endpoint."],
              ["PATCH /api/registry/endpoints/:id", "vendor", "Change a name, description, tags, visibility or price."],
              ["POST /api/registry/endpoints/:id/verify", "vendor", "Call the endpoint again and record what it said."],
              ["DELETE /api/registry/endpoints/:id", "vendor", "Remove it."],
              ["POST /api/checkout/sessions", "vendor", "Create a hosted checkout from a signed invoice."],
            ].map(([call, key, text]) => (
              <tr key={call}>
                <td className="ui-mono">{call}</td>
                <td className="ui-muted">{key}</td>
                <td className="ui-muted">{text}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <P>
          Errors are JSON, <code>{"{ \"error\": \"…\" }"}</code>, with the status that fits: 400 for a bad request, 401 for
          a missing or revoked key, 403 for the wrong kind of account, 404 for something that is not there or not yours,
          409 for an endpoint already registered.
        </P>
      </Step>

      <Step id="statuses" eyebrow="Reference" title="Statuses">
        <table className="ui-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <span className="ui-chip ui-chip--ok">verified</span>
              </td>
              <td className="ui-muted">Its own 402 matched the registration. Listed, if public.</td>
            </tr>
            <tr>
              <td>
                <span className="ui-chip ui-chip--bad">failing</span>
              </td>
              <td className="ui-muted">Saved, not listed. <code>verification.reasons</code> says what to fix.</td>
            </tr>
            <tr>
              <td>
                <span className="ui-chip ui-chip--held">pending</span>
              </td>
              <td className="ui-muted">Registered but not yet checked.</td>
            </tr>
          </tbody>
        </table>
        <P>
          Public endpoints are fetched by the platform to verify them. It will not call a private address, follow a
          redirect, or wait more than eight seconds, and it only ever sends a plain GET.
        </P>
      </Step>

      <Step id="codes" eyebrow="Reference" title="Reason codes">
        <P>
          When a payment is refused, every failing code comes back, not just the first. Hard codes refuse; soft codes
          hold the payment for a person.
        </P>
        <table className="ui-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Severity</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            {REASON_CODES.map((code) => (
              <tr key={code}>
                <td className="ui-mono">{code}</td>
                <td>
                  <span className={SEVERITY[code] === "hard" ? "ui-chip ui-chip--bad" : "ui-chip ui-chip--held"}>
                    {SEVERITY[code] === "hard" ? "refuse" : "hold"}
                  </span>
                </td>
                <td className="ui-muted">{REASON_TEXT[code]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Step>

      <Step id="env" eyebrow="Reference" title="Environment">
        <table className="ui-table">
          <thead>
            <tr>
              <th>Variable</th>
              <th>Used for</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["ZOWALL_URL", "Where the platform is served. The SDK's baseUrl."],
              ["ZOWALL_API_KEY", "Your key. Required to register endpoints and create checkouts."],
              ["GATE_ADDRESS", "The deployed gate, for paying invoices with the SDK."],
              ["PRIVATE_KEY", "The agent's wallet, which sends transactions and pays gas."],
              ["VENDOR_PRIVATE_KEY", "A vendor's invoice-signing key. Only the vendor holds it."],
            ].map(([name, text]) => (
              <tr key={name}>
                <td className="ui-mono">{name}</td>
                <td className="ui-muted">{text}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {gate ? (
          <P>
            This deployment&rsquo;s gate is{" "}
            <a href={addressUrl(env.chainId, gate) ?? "#"} target="_blank" rel="noreferrer" className="ui-mono">
              {gate}
            </a>{" "}
            on chain {env.chainId}.
          </P>
        ) : null}
      </Step>
    </>
  );
}
