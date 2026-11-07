"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import { loginAction, type LoginState } from "@/app/(auth)/actions";
import { WorldAuthButton, type SignedIn } from "@/components/account/WorldAuthButton";

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

function Field({ label, name, type = "text", autoComplete, hint, value, onChange }: { label: string; name: string; type?: string; autoComplete?: string; hint?: string; value?: string; onChange?: (v: string) => void }) {
  return (
    <label style={{ display: "grid", gap: 6, fontSize: 13.5 }}>
      <span className="ui-muted">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        style={input}
        {...(onChange ? { value: value ?? "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value) } : {})}
      />
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
  const [role, setRole] = useState<"vendor" | "buyer">(initialRole === "buyer" ? "buyer" : "vendor");
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (apiKey) {
    return (
      <div style={{ display: "grid", gap: "var(--space-4)" }}>
        <div>
          <h1 className="ui-title">Your account is ready</h1>
          <p className="ui-tile-body" style={{ marginTop: 8 }}>
            This is your API key. Copy it now: it is shown once, and only a hash of it is kept.
          </p>
        </div>
        <code className="ui-code" style={{ wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
          {apiKey}
        </code>
        <div className="ui-actions">
          <button
            type="button"
            className="ui-btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(apiKey);
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
          You sign in with World ID, so there is no password. You can create more keys, and revoke any of them, under API keys.
        </p>
      </div>
    );
  }

  const onSignedIn = (r: SignedIn) => {
    if (r.created && r.apiKey) setApiKey(r.apiKey);
    else router.push("/app"); // this person already had an account
  };

  return (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      <div>
        <h1 className="ui-title">Create your account</h1>
        <p className="ui-tile-body" style={{ marginTop: 8 }}>
          You verify with World ID: one person, one account, no password. Already have one? <Link href="/login">Sign in</Link>.
        </p>
      </div>

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

      <Field label={role === "vendor" ? "Business name" : "Name"} name="name" autoComplete="organization" value={name} onChange={setName} />

      <WorldAuthButton
        label="Sign up with World ID"
        details={{ role, name }}
        disabled={name.trim().length < 2}
        onSignedIn={onSignedIn}
      />
    </div>
  );
}

export function LoginForm({ passwordLogin = false }: { passwordLogin?: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <div style={{ display: "grid", gap: "var(--space-4)" }}>
      <div>
        <h1 className="ui-title">Sign in</h1>
        <p className="ui-tile-body" style={{ marginTop: 8 }}>
          Sign in with World ID. New here? <Link href="/signup">Create an account</Link>.
        </p>
      </div>

      <WorldAuthButton label="Sign in with World ID" onSignedIn={() => router.push("/app")} />

      {passwordLogin ? (
        <details>
          <summary className="ui-faint" style={{ cursor: "pointer", fontSize: 13 }}>
            Older account with an email and password
          </summary>
          <form action={action} style={{ display: "grid", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
            <Field label="Email" name="email" type="email" autoComplete="email" />
            <Field label="Password" name="password" type="password" autoComplete="current-password" />
            {state.error ? <div className="ui-note ui-note--warn">{state.error}</div> : null}
            <button type="submit" className="ui-btn" disabled={pending}>
              {pending ? "Signing in…" : "Sign in with password"}
            </button>
          </form>
        </details>
      ) : null}
    </div>
  );
}
