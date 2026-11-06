import type { Metadata } from "next";
import Link from "next/link";

import { Wordmark } from "@/components/Logo";

import "../app/product.css";

export const metadata: Metadata = {
  title: "Zowall docs",
  description: "Put a three-way match in front of an agent's payments: the SDK, the x402 middleware and the reference.",
};

/**
 * The docs get their own shell. They are read by someone integrating, who has no
 * need of the workspace's navigation, and the workspace has no need of the
 * docs'.
 */
const SECTIONS = [
  {
    label: "Get started",
    items: [
      ["#overview", "Overview"],
      ["#before", "Before you start"],
      ["#install", "Install the SDK"],
    ],
  },
  {
    label: "Pay an invoice",
    items: [
      ["#sign", "The vendor signs"],
      ["#pay", "Preview, then pay"],
      ["#outcomes", "Handle each outcome"],
      ["#holds", "Resolve a hold"],
      ["#verify", "Verify a decision"],
    ],
  },
  {
    label: "Pay for an API",
    items: [
      ["#x402", "The x402 middleware"],
      ["#guardians", "Guardian-protected payer"],
    ],
  },
  {
    label: "Reference",
    items: [
      ["#codes", "Reason codes"],
      ["#errors", "Reverts"],
      ["#addresses", "Addresses"],
      ["#env", "Environment"],
    ],
  },
] as const;

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ui ui-shell">
      <nav className="ui-side">
        <Link href="/" style={{ textDecoration: "none", padding: "0 10px" }} aria-label="Zowall home">
          <Wordmark size={19} />
        </Link>
        <span className="ui-chip" style={{ alignSelf: "flex-start", marginLeft: 10 }}>
          Docs
        </span>

        {SECTIONS.map((group) => (
          <div key={group.label} className="ui-side-group">
            <span className="ui-side-label">{group.label}</span>
            {group.items.map(([href, label]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
          </div>
        ))}

        <div className="ui-side-group">
          <span className="ui-side-label">Open</span>
          <Link href="/app">Workspace</Link>
          <Link href="/app/proofs">Proofs</Link>
        </div>
      </nav>
      <main className="ui-main">
        <div className="ui-main-inner">{children}</div>
      </main>
    </div>
  );
}
