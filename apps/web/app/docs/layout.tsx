import type { Metadata } from "next";
import Link from "next/link";

import { Wordmark } from "@/components/Logo";

import "../ui.css";

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
    label: "Start",
    items: [
      ["#overview", "Overview"],
      ["#install", "Install the SDK"],
      ["#keys", "API keys"],
    ],
  },
  {
    label: "Sell",
    items: [
      ["#sell", "Register an endpoint"],
      ["#sell-402", "Answer 402"],
      ["#sell-checkout", "Hosted checkout"],
    ],
  },
  {
    label: "Buy",
    items: [
      ["#buy", "Discover endpoints"],
      ["#buy-pay", "Pay with x402"],
      ["#buy-invoice", "Pay an invoice"],
    ],
  },
  {
    label: "Reference",
    items: [
      ["#api", "Registry API"],
      ["#statuses", "Statuses"],
      ["#codes", "Reason codes"],
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
          <Link href="/app">Dashboard</Link>
          <Link href="/registry">Registry</Link>
        </div>
      </nav>
      <main className="ui-main">
        <div className="ui-main-inner">{children}</div>
      </main>
    </div>
  );
}
