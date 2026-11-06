import Link from "next/link";

import { workspaceState } from "@/lib/product";

export const dynamic = "force-dynamic";

/**
 * The setup hub.
 *
 * Four steps, each on its own tab, because they are done by different people
 * at different times - a person verifies themselves, finance funds the vault,
 * an engineer points the agent at the gate - and stacking them on one scroll
 * would make every one of those people read the other three.
 */
export default async function StartHub() {
  const state = await workspaceState();
  const next = state.steps.find((s) => !s.done) ?? state.steps[0]!;

  return (
    <>
      <header>
        <p className="ui-eyebrow">Getting started</p>
        <h1 className="ui-display">Four things, then your agents can spend.</h1>
        <p className="ui-lede">
          Nothing here is a setting you can skip and come back to. Each step is checked against
          something real - who has verified, what the vault holds, whether the gate has heard from
          your agent.
        </p>
        <div className="ui-actions" style={{ marginTop: "var(--space-5)" }}>
          <Link href={`/lab/start/${next.slug}` as "/lab/start"} className="ui-btn ui-btn--primary">
            {state.ready ? "Review setup" : `Continue: ${next.title}`}
          </Link>
          {state.ready ? (
            <Link href="/lab" className="ui-btn">
              Go to the workspace
            </Link>
          ) : null}
        </div>
      </header>

      <section className="ui-section">
        <ul className="ui-numlist">
          {state.steps.map((step) => (
            <li key={step.slug} className="ui-numrow">
              <span className="ui-numrow-n">{step.n}</span>
              <Link
                href={`/lab/start/${step.slug}` as "/lab/start"}
                className="ui-numrow-label"
                style={{ textDecoration: "none" }}
              >
                {step.title}
              </Link>
              <span className="ui-numrow-note">
                {step.done ? (
                  <span className="ui-chip ui-chip--ok">Done</span>
                ) : (
                  <span className="ui-chip">To do</span>
                )}
              </span>
              <span className="ui-numrow-sub">{step.blurb}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="ui-section">
        <div className="ui-split">
          <div>
            <h2 className="ui-title">What you are setting up</h2>
            <p className="ui-lede">
              A spend gate, not a wallet. Your agent keeps its own keys and its own logic. It just
              stops being the thing that decides a payment is legitimate.
            </p>
          </div>
          <div className="ui-tiles">
            <div className="ui-tile ui-tile--fill">
              <h3 className="ui-tile-title">Ordered</h3>
              <p className="ui-tile-body">
                A purchase order reserves the money before anything is bought.
              </p>
            </div>
            <div className="ui-tile ui-tile--fill">
              <h3 className="ui-tile-title">Received</h3>
              <p className="ui-tile-body">
                A second person signs that the goods or the calls actually arrived.
              </p>
            </div>
            <div className="ui-tile ui-tile--fill">
              <h3 className="ui-tile-title">Invoiced</h3>
              <p className="ui-tile-body">
                The vendor&rsquo;s signed invoice is compared against both of them.
              </p>
            </div>
            <div className="ui-tile ui-tile--fill">
              <h3 className="ui-tile-title">Decided</h3>
              <p className="ui-tile-body">
                The contract pays, refuses, or parks it for a third person.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
