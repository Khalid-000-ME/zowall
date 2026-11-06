import Link from "next/link";
import { REASON_CODES, REASON_TEXT, SEVERITY } from "@zowall/gate-core";

import { CodeBlock } from "@/components/docs/CodeBlock";
import { addressUrl, hashscanTopic } from "@/lib/chains";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/* ----------------------------------------------------------------- snippets -- */

const INSTALL = `# The packages are workspace packages in this repository. They are not on npm.
git clone <this repository> && cd zowall
pnpm install

# To use them from another package in the workspace:
pnpm --filter <your-package> add @zowall/sdk@workspace:* viem@2.21.55`;

const SIGN = `import { signInvoice, type Invoice } from "@zowall/sdk";

const invoice: Invoice = {
  poId,                       // the order this bills
  vendor,                     // the vendor key named on the order
  payee,                      // the address the order says is paid
  qty,                        // units billed
  unitPrice,                  // USDT base units, 6 decimals: 1.00 USDT is 1_000_000n
  invoiceHash,                // your own identifier for this invoice
  nonce,                      // unique per invoice
  deadline,                   // unix seconds after which the signature is dead
};

const signature = await signInvoice(invoice, {
  privateKey: vendorKey,      // the vendor's key, never the buyer's
  chainId: 1874,
  gateAddress,
});`;

const PAY = `import { createGate } from "@zowall/sdk";

const gate = createGate({
  gateAddress,
  publicClient,               // a viem PublicClient on Whitechain Sepolia
  walletClient,               // the agent's own wallet, which sends the transaction
});

// 1. Ask first. Changes nothing, costs no gas.
const preview = await gate.preview(invoice, signature);
console.log(preview.outcome, preview.codes, preview.explain());

// 2. Pay. It does not throw because a document was wrong.
const result = await gate.pay(invoice, signature);

if (result.outcome === "PAID")     { /* USDT moved to the payee, in this transaction */ }
if (result.outcome === "HELD")     { /* parked for a third person. Funds stay reserved */ }
if (result.outcome === "REJECTED") { /* nothing moved. result.codes says every reason */ }

console.log(result.explain(), result.txHash);`;

const RUN = `set -a; source .env.local; set +a
PO_ID=<order id> QTY=<units> node packages/sdk/examples/quickstart.ts`;

const RETRY = `import { GATE_ABI } from "@zowall/sdk";

// Anyone may call this. It re-evaluates the held invoice with no person involved,
// so an invoice held only because nothing had arrived yet pays the moment a receipt lands.
await walletClient.writeContract({
  address: gateAddress,
  abi: GATE_ABI,
  functionName: "retry",
  args: [holdId],
});`;

const VERIFY = `# Verify one decision from its own log, with nothing supplied by us
node packages/e2e/src/verify-decision.ts <transaction hash>

# Replay the whole journal against the chain. Needs no credentials.
node packages/journal/src/cli.ts replay <topic id> --gate <gate address>`;

const X402 = `import { createGuard, withZowall } from "@zowall/x402";

const guarded = withZowall({
  // Matches every 402 quote against a mandate: an open order whose spec is the URL.
  guard: createGuard({ keccak256, findMandate, roles }),

  // Only called for a quote that passed. Your x402 client still does the paying.
  signPayment: async (quote) => ({ payload: await buildPayload(quote) }),
});

// Anything that is not a 402 passes straight through.
const response = await guarded("https://api.example.com/premium");

// A refusal comes back as a 402 carrying the reason codes. The payment was never signed.
if (response.status === 402) {
  const { zowall } = await response.json();
  console.log(zowall.outcome, zowall.codes);
}`;

const MANDATE = `RESOURCE_URL=https://api.example.com/premium \\
MANDATE_CALLS=20 MANDATE_PRICE=10000 \\
  node packages/e2e/src/x402-mandate.ts`;

const GUARDIAN = `import { buildAgentSignedTransfer, createGuardian, guardianQuorum, toPayload }
  from "@zowall/x402/hedera";

const guardians = guardianKeys.map((key) =>
  createGuardian({ key, guard, payer }),   // each guardian runs its own guard
);

signPayment: async (quote) => {
  // The agent signs the transfer...
  const tx = await buildAgentSignedTransfer({ client, requirements: quote, payer, agent });
  // ...then 2 of 3 guardians each decode it, check it against the quote and the
  // mandate, and co-sign. Without them the network will not move the money.
  const { bytes } = await guardianQuorum(tx, quote, guardians, 2);
  return { payload: toPayload(bytes) };
},`;

const GUARDIAN_SETUP = `set -a; source .env.local; set +a
node packages/x402/scripts/guardian-setup.ts`;

/* ------------------------------------------------------------------- pieces -- */

function Step({
  n,
  id,
  title,
  children,
}: {
  n: string;
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="ui-section" style={{ scrollMarginTop: 24 }}>
      <div className="ui-split">
        <div>
          <p className="ui-eyebrow">{n}</p>
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
        <h1 className="ui-display">Put a three-way match in front of your agent&rsquo;s payments.</h1>
        <p className="ui-lede">
          Your agent keeps its own keys, its own model and its own logic. One call changes: the one that
          used to move money now asks a contract, and a refusal is a possible answer.
        </p>
      </header>

      <section className="ui-section">
        <div className="ui-split">
          <div>
            <h2 className="ui-title">How the pieces fit</h2>
          </div>
          <ul className="ui-numlist">
            <li className="ui-numrow">
              <span className="ui-numrow-n">01</span>
              <span className="ui-numrow-label">People raise orders and sign for deliveries</span>
              <span className="ui-numrow-sub">
                In the <Link href="/app/orders">workspace</Link>, as three different World ID verified
                humans. The contract enforces that they differ.
              </span>
            </li>
            <li className="ui-numrow">
              <span className="ui-numrow-n">02</span>
              <span className="ui-numrow-label">Your agent pays through the SDK</span>
              <span className="ui-numrow-sub">
                <code>gate.pay(invoice, signature)</code>. Matching invoices pay in the same transaction;
                everything else is held or refused with every reason.
              </span>
            </li>
            <li className="ui-numrow">
              <span className="ui-numrow-n">03</span>
              <span className="ui-numrow-label">Every decision is verifiable</span>
              <span className="ui-numrow-sub">
                The digest of each decision is on a Hedera topic nobody can edit, and anyone can recompute
                it from the chain without asking you.
              </span>
            </li>
          </ul>
        </div>
      </section>

      {/* ---------------------------------------------------------------- before -- */}
      <Step n="Step 1" id="before" title="Before you start">
        <P>
          Three things have to exist before an agent can pay anything. Each is a page in the workspace, and
          each is checked against something real, not a flag.
        </P>
        <ul className="ui-numlist">
          <li className="ui-numrow">
            <span className="ui-numrow-n">a</span>
            <Link href="/app/start/people" className="ui-numrow-label" style={{ textDecoration: "none" }}>
              Verify three people with World ID
            </Link>
            <span className="ui-numrow-sub">
              One raises orders, one signs for deliveries, one releases exceptions. Verify them at{" "}
              <Link href="/enroll">/enroll</Link>.
            </span>
          </li>
          <li className="ui-numrow">
            <span className="ui-numrow-n">b</span>
            <Link href="/app/start/vault" className="ui-numrow-label" style={{ textDecoration: "none" }}>
              Fund the vault
            </Link>
            <span className="ui-numrow-sub">
              Send test USDT to the gate. There is no withdraw function: money leaves only as a payment the
              rules approved.
            </span>
          </li>
          <li className="ui-numrow">
            <span className="ui-numrow-n">c</span>
            <Link href="/app/orders" className="ui-numrow-label" style={{ textDecoration: "none" }}>
              Raise an order, then sign for the delivery
            </Link>
            <span className="ui-numrow-sub">
              Raising an order reserves the money. A different person then signs that the goods arrived.
              Both are on the Orders page.
            </span>
          </li>
        </ul>
      </Step>

      {/* --------------------------------------------------------------- install -- */}
      <Step n="Step 2" id="install" title="Install the SDK">
        <P>
          <code>@zowall/sdk</code> is a workspace package in this repository. It is not published to npm, so
          you use it from inside the workspace or copy <code>packages/sdk</code> and{" "}
          <code>packages/gate-core</code> into your project.
        </P>
        <CodeBlock code={INSTALL} />
        <P>
          You need the deployed gate address, the chain id and an RPC URL. These are the live values for this
          deployment:
        </P>
        <div className="ui-panel">
          <div className="ui-row">
            <span className="ui-muted">Gate</span>
            {gate ? (
              <a href={addressUrl(env.chainId, gate) ?? "#"} target="_blank" rel="noreferrer" className="ui-mono">
                {gate}
              </a>
            ) : (
              <span className="ui-faint">not configured</span>
            )}
          </div>
          <div className="ui-row">
            <span className="ui-muted">Chain id</span>
            <span className="ui-mono">{env.chainId} (Whitechain Sepolia)</span>
          </div>
          <div className="ui-row">
            <span className="ui-muted">RPC</span>
            <span className="ui-mono">{env.rpcUrl}</span>
          </div>
        </div>
      </Step>

      {/* ------------------------------------------------------------------ sign -- */}
      <Step n="Step 3" id="sign" title="The vendor signs the invoice">
        <P>
          The vendor&rsquo;s signature is the authority, not whoever sends the transaction. It covers the
          payee, the quantity, the price, the hash, the nonce and the deadline, so a relayer cannot alter an
          invoice, only delay it. Vendors sign; buyers never can.
        </P>
        <CodeBlock code={SIGN} label="Vendor side" />
        <P>
          Amounts are USDT base units. Whitechain Sepolia USDT has <strong>6 decimals</strong>, so 1.00 USDT is{" "}
          <code>1_000_000n</code>. Never assume 18.
        </P>
      </Step>

      {/* ------------------------------------------------------------------- pay -- */}
      <Step n="Step 4" id="pay" title="Preview, then pay">
        <P>
          Create the gate client with the agent&rsquo;s own wallet, ask what would happen, then pay.{" "}
          <code>pay</code> never throws because a document was wrong: a refusal is a result, and an agent that
          treats a refusal as an exception will retry it in a loop.
        </P>
        <CodeBlock code={PAY} label="Agent side" />
        <P>A complete, runnable version is in the repository. It reads an order and pays it:</P>
        <CodeBlock code={RUN} />
        <P>
          On a fresh order with a receipt, that prints <code>PAID</code> and a transaction link. Run it against
          an order whose budget is spent and it prints <code>BUDGET_EXCEEDED</code>, which is the control
          working.
        </P>
      </Step>

      {/* -------------------------------------------------------------- outcomes -- */}
      <Step n="Step 5" id="outcomes" title="Handle each outcome">
        <table className="ui-table">
          <thead>
            <tr>
              <th>Outcome</th>
              <th>What happened</th>
              <th>What your agent does</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <span className="ui-chip ui-chip--ok">PAID</span>
              </td>
              <td>Matched the order and the receipt. USDT moved to the order&rsquo;s payee in the same transaction.</td>
              <td>Record <code>txHash</code> and carry on.</td>
            </tr>
            <tr>
              <td>
                <span className="ui-chip ui-chip--held">HELD</span>
              </td>
              <td>
                Only soft rules failed (<code>NO_RECEIPT</code>, <code>QTY_OVER_RECEIVED</code>,{" "}
                <code>PRICE_OVER_TOLERANCE</code>). Funds stay reserved.
              </td>
              <td>
                Do not resubmit. If it was <code>NO_RECEIPT</code>, <code>retry</code> it once a receipt lands.
                Otherwise a third person decides it.
              </td>
            </tr>
            <tr>
              <td>
                <span className="ui-chip ui-chip--bad">REJECTED</span>
              </td>
              <td>A hard rule failed. Nothing moved. Every failing code is returned, not just the first.</td>
              <td>
                Stop. Read <code>result.codes</code>. A rejected invoice is recorded as seen, so the vendor
                re-signs a corrected one with a new hash.
              </td>
            </tr>
          </tbody>
        </table>
      </Step>

      {/* ----------------------------------------------------------------- holds -- */}
      <Step n="Step 6" id="holds" title="Resolve a hold">
        <P>
          A held invoice waits in the <Link href="/app/exceptions">exception queue</Link>. It can be decided by
          a person who did not raise the order and did not sign for the delivery. The creator and the receiver
          are refused on-chain with <code>SodViolation</code>; the refusal is a transaction you can open.
        </P>
        <P>
          A hold that was only waiting for a receipt needs no person. Anyone can ask the gate to re-evaluate it:
        </P>
        <CodeBlock code={RETRY} />
        <P>
          Approving a variance that costs more than was reserved amends the order: the shortfall is drawn from
          free balance only, never from another order&rsquo;s reservation.
        </P>
      </Step>

      {/* ---------------------------------------------------------------- verify -- */}
      <Step n="Step 7" id="verify" title="Verify a decision">
        <P>
          Every decision emits an event carrying the 448-byte preimage its digest was taken over, and the same
          digest is written to a Hedera topic
          {env.hederaTopicId ? (
            <>
              {" "}
              (
              <a href={hashscanTopic(env.hederaTopicId)} target="_blank" rel="noreferrer">
                {env.hederaTopicId}
              </a>
              )
            </>
          ) : null}
          . Anyone can recompute it from the chain&rsquo;s own logs.
        </P>
        <CodeBlock code={VERIFY} />
        <P>
          The replay also checks the record around the decisions: contiguous sequence numbers, rising consensus
          times, that every message was paid for by the journal&rsquo;s own account, and that the topic is
          closed to strangers, immutable, and names this gate.
        </P>
      </Step>

      {/* ------------------------------------------------------------------ x402 -- */}
      <Step n="Step 8" id="x402" title="Pay for an API with x402">
        <P>
          When the agent pays a machine, not a vendor, wrap its <code>fetch</code>. A payment-required response
          names a payee, a price and a resource, which is an invoice, so the same eleven rules judge it. The{" "}
          <em>mandate</em> is an ordinary order whose spec is the endpoint URL, raised by one person and signed
          for by another. It speaks x402 v2 and still reads v1.
        </P>
        <CodeBlock code={MANDATE} label="Raise the mandate once" />
        <CodeBlock code={X402} label="Wrap the agent's fetch" />
        <P>
          Try every attack in <Link href="/app/metered">Metered spend</Link>: an unauthorised endpoint, a swapped
          payee, a raised price, a replay, and an agent that skips the middleware entirely.
        </P>
      </Step>

      <Step n="Step 9" id="guardians" title="Make the middleware impossible to skip">
        <P>
          A wrapper around <code>fetch</code> is a control the agent can simply not call. So write the guard into
          the payer account&rsquo;s key, which Hedera evaluates on every transaction:
        </P>
        <pre className="ui-code">{"2 of [ agent key,  2 of [ guardian 1, guardian 2, guardian 3 ] ]"}</pre>
        <P>
          The network will not move a tinybar unless the agent <strong>and</strong> a quorum of guardians signed.
          Each guardian decodes the transaction itself and signs only if it pays exactly what the quote says, to
          the account the mandate names. A facilitator checks the same key before it sponsors the payment.
        </P>
        <CodeBlock code={GUARDIAN_SETUP} label="Create the account once" />
        <CodeBlock code={GUARDIAN} label="Sign through the guardians" />
        <P>
          The setup script shows the refusals against the live network: the agent alone, the agent plus one
          guardian, and the guardians without the agent are each refused with <code>INVALID_SIGNATURE</code>.
        </P>
      </Step>

      {/* ------------------------------------------------------------- reference -- */}
      <section id="codes" className="ui-section" style={{ scrollMarginTop: 24 }}>
        <p className="ui-eyebrow">Reference</p>
        <h2 className="ui-title">Reason codes</h2>
        <P>
          Eleven codes, evaluated in a fixed order, with all failures returned. The most specific code wins:{" "}
          <code>NO_RECEIPT</code> suppresses <code>QTY_OVER_RECEIVED</code>, which suppresses{" "}
          <code>BUDGET_EXCEEDED</code>.
        </P>
        <table className="ui-table" style={{ marginTop: "var(--space-5)" }}>
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
      </section>

      <section id="errors" className="ui-section" style={{ scrollMarginTop: 24 }}>
        <h2 className="ui-title">Reverts</h2>
        <P>
          A bad invoice is a result, never a revert. These are the calls that do revert, all of them on the
          actions people take (raising an order, signing for a delivery, deciding a hold).
        </P>
        <table className="ui-table" style={{ marginTop: "var(--space-5)" }}>
          <thead>
            <tr>
              <th>Error</th>
              <th>What it means</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["SodViolation", "One human would hold two roles on one order. This is the control working."],
              ["ActionMismatch", "The attestation was signed for different arguments than the call carries."],
              ["BadAttestation", "The signatures are not a quorum of the registered attestors, or are out of order."],
              ["AttestationReplayed", "That attestation was already used. Each one authorises one action."],
              ["AttestationExpired", "The attestation outlived its ten minutes. Ask for a new one."],
              ["WrongRole", "An attestation for one role was used for another."],
              ["NotEnoughBalanceToEncumber", "The vault's free balance cannot cover this order's reservation."],
              ["ExceedsEncumbrance", "An override would need more than the free balance can supply."],
              ["NotPOCreator", "Only the person who raised an order can cancel it."],
              ["HoldAlreadyResolved", "Someone already decided this hold."],
            ].map(([name, text]) => (
              <tr key={name}>
                <td className="ui-mono">{name}</td>
                <td className="ui-muted">{text}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section id="addresses" className="ui-section" style={{ scrollMarginTop: 24 }}>
        <h2 className="ui-title">Addresses</h2>
        <div className="ui-panel" style={{ marginTop: "var(--space-5)" }}>
          <div className="ui-row">
            <span className="ui-muted">ZowallGate</span>
            {gate ? (
              <a href={addressUrl(env.chainId, gate) ?? "#"} target="_blank" rel="noreferrer" className="ui-mono">
                {gate}
              </a>
            ) : (
              <span className="ui-faint">not configured</span>
            )}
          </div>
          <div className="ui-row">
            <span className="ui-muted">USDT (6 decimals)</span>
            {env.usdtAddress ? (
              <a
                href={addressUrl(env.chainId, env.usdtAddress) ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="ui-mono"
              >
                {env.usdtAddress}
              </a>
            ) : (
              <span className="ui-faint">not configured</span>
            )}
          </div>
          <div className="ui-row">
            <span className="ui-muted">Journal topic</span>
            {env.hederaTopicId ? (
              <a href={hashscanTopic(env.hederaTopicId)} target="_blank" rel="noreferrer" className="ui-mono">
                {env.hederaTopicId}
              </a>
            ) : (
              <span className="ui-faint">not configured</span>
            )}
          </div>
        </div>
        <p className="ui-tile-body" style={{ marginTop: "var(--space-3)" }}>
          Everything on <Link href="/app/proofs">Proofs</Link> is read live from these.
        </p>
      </section>

      <section id="env" className="ui-section" style={{ scrollMarginTop: 24 }}>
        <h2 className="ui-title">Environment</h2>
        <table className="ui-table" style={{ marginTop: "var(--space-5)" }}>
          <thead>
            <tr>
              <th>Variable</th>
              <th>Used for</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["GATE_ADDRESS", "The deployed gate. Required by the SDK and every script."],
              ["PRIVATE_KEY", "The agent's wallet, which sends transactions and pays gas."],
              ["VENDOR_PRIVATE_KEY", "A vendor's signing key. Only the vendor holds it."],
              ["EVM_RPC_URL", "Overrides the default Whitechain Sepolia RPC when it is unreliable."],
              ["HEDERA_TOPIC_ID", "The journal topic, for replay."],
              ["FACILITATOR_URL", "An x402 facilitator. Defaults to https://x402.org/facilitator."],
              ["X402_PAYER_ACCOUNT, X402_AGENT_KEY, X402_GUARDIAN_KEYS", "Written by the guardian setup script."],
            ].map(([name, text]) => (
              <tr key={name}>
                <td className="ui-mono">{name}</td>
                <td className="ui-muted">{text}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ui-tile-body" style={{ marginTop: "var(--space-3)" }}>
          The full list, with how to obtain each, is in <code>docs/SETUP.md</code> in the repository.
        </p>
      </section>
    </>
  );
}
