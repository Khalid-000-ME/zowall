"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import { loginAction, signUpAction, type LoginState, type SignUpState } from "@/app/(auth)/actions";

const input: React.CSSProperties = {
  padding: "11px 13px",
  border: "1px solid var(--border-strong)",
  borderRadius: 9,
  background: "var(--surface)",
  color: "var(--text)",
  font: "inherit",
  fontSize: 14.5,
  width: "100%",
};

function Field({ label, name, type = "text", autoComplete, hint }: { label: string; name: string; type?: string; autoComplete?: string; hint?: string }) {
  return (
    <label style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
      <span className="ui-muted">{label}</span>
      <input name={name} type={type} autoComplete={autoComplete} required style={input} />
      {hint ? <span className="ui-faint" style={{ fontSize: 12.5 }}>{hint}</span> : null}
    </label>
  );
}

const CHOICES = [
  { role: "vendor", title: "I'm selling", body: "Register an x402 endpoint so agents can find it and pay for it." },
  { role: "buyer", title: "I'm buying", body: "Get an API key so my agents can discover endpoints and pay for them." },
] as const;

export function SignUpForm({ initialRole }: { initialRole?: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<SignUpState, FormData>(signUpAction, {});
  const [role, setRole] = useState<"vendor" | "buyer">(initialRole === "buyer" ? "buyer" : "vendor");
  const [copied, setCopied] = useState(false);

  if (state.apiKey) {
    return (
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        <div>
          <h1 className="ui-title">Your account is ready</h1>
          <p className="ui-tile-body" style={{ marginTop: 8 }}>
            This is your API key. Copy it now: it is shown once, and only a hash of it is kept.
          </p>
        </div>
        <code className="ui-code" style={{ wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
          {state.apiKey}
        </code>
        <div className="ui-actions">
          <button
            type="button"
            className="ui-btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(state.apiKey!);
                setCopied(true);
              } catch {
                // the key is on screen either way
              }
            }}
          >
            {copied ? "Copied" : "Copy key"}
          </button>
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => router.push("/app")}>
            Continue
          </button>
        </div>
        <p className="ui-faint" style={{ fontSize: 12.5, margin: 0 }}>
          You can create more keys, and revoke any of them, under API keys.
        </p>
      </div>
    );
  }

  return (
    <form action={action} style={{ display: "grid", gap: "var(--space-4)" }}>
      <div>
        <h1 className="ui-title">Create your account</h1>
        <p className="ui-tile-body" style={{ marginTop: 8 }}>
          Already have one? <Link href="/login">Log in</Link>.
        </p>
      </div>

      <input type="hidden" name="role" value={role} />
      <div className="ui-choices" role="radiogroup" aria-label="What brings you here">
        {CHOICES.map((c) => (
          <button
            key={c.role}
            type="button"
            role="radio"
            aria-checked={role === c.role}
            className="ui-choice"
            onClick={() => setRole(c.role)}
          >
            <strong>{c.title}</strong>
            <span>{c.body}</span>
          </button>
        ))}
      </div>

      <Field label={role === "vendor" ? "Business name" : "Name"} name="name" autoComplete="organization" />
      <Field label="Email" name="email" type="email" autoComplete="email" />
      <Field label="Password" name="password" type="password" autoComplete="new-password" hint="At least 10 characters." />

      {state.error ? <div className="ui-note ui-note--warn">{state.error}</div> : null}

      <button type="submit" className="ui-btn ui-btn--primary" disabled={pending}>
        {pending ? "Creating…" : "Create account"}
      </button>
    </form>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} style={{ display: "grid", gap: "var(--space-4)" }}>
      <div>
        <h1 className="ui-title">Log in</h1>
        <p className="ui-tile-body" style={{ marginTop: 8 }}>
          New here? <Link href="/signup">Create an account</Link>.
        </p>
      </div>
      <Field label="Email" name="email" type="email" autoComplete="email" />
      <Field label="Password" name="password" type="password" autoComplete="current-password" />
      {state.error ? <div className="ui-note ui-note--warn">{state.error}</div> : null}
      <button type="submit" className="ui-btn ui-btn--primary" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
