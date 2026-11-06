"use client";

import { useCallback, useEffect, useState } from "react";
import { REASON_TEXT, type ReasonCode } from "@zowall/gate-core";

import { AsciiShape } from "@/components/AsciiShape";
import { Wordmark } from "@/components/Logo";
import type { CheckoutView as View } from "@/lib/checkout";

/** The merchant's return URL, with the session appended so they can look it up. */
function returnUrl(base: string | null, id: string): string | null {
  if (!base) return null;
  try {
    const u = new URL(base);
    u.searchParams.set("session", id);
    return u.toString();
  } catch {
    return null;
  }
}

const short = (v: string, lead = 8, tail = 6) => (v.length > lead + tail + 2 ? `${v.slice(0, lead)}…${v.slice(-tail)}` : v);

function Mark({ state }: { state: "pass" | "hold" | "fail" }) {
  const common = { width: 18, height: 18, viewBox: "0 0 18 18", fill: "none", "aria-hidden": true } as const;
  if (state === "pass") {
    return (
      <svg {...common}>
        <circle cx="9" cy="9" r="9" fill="#e7f6ee" />
        <path d="M5.2 9.3l2.4 2.4 5.2-5.4" stroke="#18864b" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === "hold") {
    return (
      <svg {...common}>
        <circle cx="9" cy="9" r="9" fill="#fdf1da" />
        <path d="M9 5v4.4l2.6 1.5" stroke="#b86e00" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="9" cy="9" r="9" fill="#fde8e6" />
      <path d="M6.2 6.2l5.6 5.6M11.8 6.2l-5.6 5.6" stroke="#c4321f" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="co-field">
      <span className="co-label">{label}</span>
      <div className={mono ? "co-input co-mono" : "co-input"} title={value}>
        {value}
      </div>
    </div>
  );
}

export function CheckoutView({ initial }: { initial: View }) {
  const [view, setView] = useState(initial);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/checkout/sessions/${view.id}`, { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; view?: View };
      if (data.ok && data.view) setView(data.view);
    } catch {
      // A missed poll changes nothing; the next one will catch up.
    }
  }, [view.id]);

  // A held invoice is waiting on a person, so keep looking until someone decides it.
  useEffect(() => {
    if (view.status !== "held" || view.result?.resolution) return;
    const t = setInterval(() => void refresh(), 6000);
    return () => clearInterval(t);
  }, [view.status, view.result?.resolution, refresh]);

  async function pay() {
    setPaying(true);
    setError(null);
    try {
      const res = await fetch(`/api/checkout/sessions/${view.id}/pay`, { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; view?: View; error?: string };
      if (data.ok && data.view) setView(data.view);
      else setError(data.error ?? "The payment could not be sent. Try again.");
    } catch {
      setError("The payment could not be sent. Check your connection and try again.");
    } finally {
      setPaying(false);
    }
  }

  const blocked = view.preview === "REJECTED";
  const done = view.status !== "open" && view.status !== "processing";
  const back = returnUrl(view.cancelUrl, view.id);

  return (
    <div className="co-grid">
      {/* ------------------------------------------------------------- summary -- */}
      <aside className="co-left">
        <div className="co-left-inner">
          <div className="co-brand">
            {back ? (
              <a href={back} className="co-back" aria-label="Back to the merchant">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                  <path d="M15 9H3M8 4L3 9l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            ) : null}
            <Wordmark size={22} />
          </div>

          <p className="co-item">{view.description}</p>
          <p className="co-amount">
            {view.total}
            <span> USDT</span>
          </p>

          <div className="co-art" aria-hidden>
            <AsciiShape shape="ledger" cols={84} rows={42} speed={0.7} />
          </div>

          <dl className="co-summary">
            <div>
              <dt>Quantity</dt>
              <dd>{view.qty}</dd>
            </div>
            <div>
              <dt>Unit price</dt>
              <dd>{view.unitPrice} USDT</dd>
            </div>
            <div className="co-total">
              <dt>Total due</dt>
              <dd>{view.total} USDT</dd>
            </div>
          </dl>
        </div>
      </aside>

      {/* ------------------------------------------------------------- payment -- */}
      <main className="co-right">
        <div className="co-right-inner">
          {view.status === "paid" && view.result ? (
            <Outcome
              tone="ok"
              title="Payment complete"
              body={`${view.total} USDT was sent to the order's payee in a single transaction.`}
              view={view}
              next={returnUrl(view.successUrl, view.id)}
              nextLabel="Return to merchant"
            />
          ) : null}

          {view.status === "held" && view.result ? (
            view.result.resolution ? (
              <Outcome
                tone={view.result.resolution.approved ? "ok" : "bad"}
                title={view.result.resolution.approved ? "Approved and paid" : "Declined"}
                body={
                  view.result.resolution.approved
                    ? "A person who did not raise the order or sign for the delivery approved it, and the payment was sent."
                    : "A person who did not raise the order or sign for the delivery declined it. Nothing was sent, and the funds stay reserved."
                }
                view={view}
                extraUrl={view.result.resolution.txUrl}
                extraLabel="Decision"
                next={returnUrl(view.result.resolution.approved ? view.successUrl : view.cancelUrl, view.id)}
                nextLabel="Return to merchant"
              />
            ) : (
              <Outcome
                tone="wait"
                title="Waiting for approval"
                body="Something in this invoice needs a person to look at it. Someone who did not raise the order or sign for the delivery has to approve it. Your funds stay reserved until they do. This page updates by itself."
                view={view}
                next={returnUrl(view.cancelUrl, view.id)}
                nextLabel="Return to merchant"
              />
            )
          ) : null}

          {view.status === "refused" && view.result ? (
            <Outcome
              tone="bad"
              title="Payment refused"
              body="The gate checked this invoice against its purchase order and receipt, and it does not match. Nothing was sent."
              view={view}
              next={returnUrl(view.cancelUrl, view.id)}
              nextLabel="Return to merchant"
            />
          ) : null}

          {!done ? (
            <>
              <h1 className="co-h">Invoice</h1>
              <Field label="Order" value={`#${view.orderId}`} />
              <Field label="Pay to" value={view.payee} mono />
              <Field label="Invoice reference" value={short(view.invoiceRef, 14, 8)} mono />
              {view.reference ? <Field label="Merchant reference" value={view.reference} /> : null}

              <h2 className="co-h">Checks</h2>
              <ul className="co-checks">
                {view.checks.map((c) => (
                  <li key={c.label}>
                    <Mark state={view.preview === null ? "hold" : c.state} />
                    <span>{c.label}</span>
                    {view.preview !== null && c.detail ? <code>{c.detail}</code> : null}
                  </li>
                ))}
              </ul>
              {view.preview === null ? (
                <p className="co-note">The chain did not answer just now, so these are not confirmed. The gate decides when you pay.</p>
              ) : null}

              <h2 className="co-h">Payment method</h2>
              <div className="co-methods">
                <label className="co-method">
                  <input type="radio" name="method" checked readOnly />
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
                    <circle cx="11" cy="11" r="9" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M11 6.5v9M8.6 8.6c.4-1 1.3-1.4 2.4-1.4 1.3 0 2.3.6 2.3 1.6 0 2.2-4.7 1-4.7 3.2 0 1 1 1.6 2.4 1.6 1.1 0 2-.4 2.4-1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                  <span>USDT on Whitechain</span>
                  <em>settled on-chain</em>
                </label>
              </div>

              {blocked ? (
                <div className="co-alert">
                  <strong>This invoice can&rsquo;t be paid.</strong>{" "}
                  {view.checks
                    .filter((c) => c.state === "fail")
                    .map((c) => REASON_TEXT[c.detail as ReasonCode] ?? c.detail)
                    .join(" ")}
                </div>
              ) : null}
              {view.expired ? (
                <div className="co-alert">This invoice has expired. Ask the merchant for a new one.</div>
              ) : null}
              {error ? <div className="co-alert">{error}</div> : null}

              <button
                type="button"
                className="co-pay"
                onClick={() => void pay()}
                disabled={paying || view.status === "processing" || blocked || view.expired}
              >
                {paying || view.status === "processing" ? "Processing…" : `Pay ${view.total} USDT`}
              </button>

              <p className="co-foot">
                The funds were reserved when the order was raised. Paying releases them to the vendor only if the
                invoice matches the order and a different person signed for the delivery.
              </p>
            </>
          ) : null}

          <p className="co-secure">
            Secured by the Zowall gate
            {view.explorer.gate ? (
              <>
                {" "}
                ·{" "}
                <a href={view.explorer.gate} target="_blank" rel="noreferrer">
                  contract
                </a>
              </>
            ) : null}
          </p>
        </div>
      </main>
    </div>
  );
}

function Outcome({
  tone,
  title,
  body,
  view,
  next,
  nextLabel,
  extraUrl,
  extraLabel,
}: {
  tone: "ok" | "bad" | "wait";
  title: string;
  body: string;
  view: View;
  next: string | null;
  nextLabel: string;
  extraUrl?: string | null;
  extraLabel?: string;
}) {
  const state = tone === "ok" ? "pass" : tone === "wait" ? "hold" : "fail";
  return (
    <div className="co-outcome">
      <div className="co-outcome-mark">
        <Mark state={state} />
      </div>
      <h1 className="co-outcome-title">{title}</h1>
      <p className="co-outcome-body">{body}</p>

      {view.result && view.result.reasons.length > 0 && tone === "bad" && view.status === "refused" ? (
        <ul className="co-reasons">
          {view.result.reasons.map((code) => (
            <li key={code}>
              <code>{code}</code>
              <span>{REASON_TEXT[code as ReasonCode] ?? code}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="co-links">
        {view.result?.txUrl ? (
          <a href={view.result.txUrl} target="_blank" rel="noreferrer" className="co-link">
            {view.status === "held" ? "Invoice submitted" : "Transaction"} · {short(view.result.txHash, 10, 6)}
          </a>
        ) : null}
        {extraUrl ? (
          <a href={extraUrl} target="_blank" rel="noreferrer" className="co-link">
            {extraLabel}
          </a>
        ) : null}
      </div>

      {next ? (
        <a href={next} className="co-pay co-return">
          {nextLabel}
        </a>
      ) : null}
    </div>
  );
}
