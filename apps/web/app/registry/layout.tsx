import type { Metadata } from "next";
import Link from "next/link";

import { Wordmark } from "@/components/Logo";

import "../ui.css";

export const metadata: Metadata = {
  title: "Zowall registry",
  description: "Paid x402 endpoints that have been called and verified: what they charge, who they pay, and how to spend against them.",
};

/** The public catalogue. Anyone, human or agent, can read it without an account. */
export default function RegistryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ui" style={{ minHeight: "100dvh" }}>
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        <div
          style={{
            width: "min(1120px, calc(100% - 32px))",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 60,
          }}
        >
          <Link href="/registry" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 12 }}>
            <Wordmark size={19} />
            <span className="ui-chip">Registry</span>
          </Link>
          <nav style={{ display: "flex", gap: 20, fontSize: 14 }}>
            <Link href="/docs#registry" style={{ textDecoration: "none" }}>
              Docs
            </Link>
            <Link href="/app/endpoints" style={{ textDecoration: "none" }}>
              Register an endpoint
            </Link>
          </nav>
        </div>
      </header>
      <main style={{ width: "min(1120px, calc(100% - 32px))", margin: "0 auto", padding: "56px 0 96px" }}>
        {children}
      </main>
    </div>
  );
}
