import Link from "next/link";

import { Wordmark } from "@/components/Logo";

import "../ui.css";

/** Sign up and log in. A single card, nothing to leave through but the way back. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ui ui-auth">
      <div className="ui-auth-card">
        <Link href="/" style={{ textDecoration: "none", display: "inline-block", marginBottom: "var(--space-6)" }} aria-label="Zowall home">
          <Wordmark size={22} />
        </Link>
        {children}
      </div>
    </div>
  );
}
