"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Wordmark } from "@/components/Logo";

/**
 * The workspace sidebar.
 *
 * A tool with no hero gets a persistent shell rather than a floating navbar,
 * and nothing here links into the explainer: a visitor is either being shown
 * how the control works or using it, and mixing the two makes both read as a
 * demo.
 */
type Item = { href: string; label: string; badge?: string };

const GROUPS: ReadonlyArray<{ label: string; items: readonly Item[] }> = [
  {
    label: "Workspace",
    items: [
      { href: "/lab", label: "Overview" },
      { href: "/lab/orders", label: "Orders" },
      { href: "/lab/exceptions", label: "Exceptions" },
    ],
  },
  {
    label: "Connect",
    items: [
      { href: "/lab/agents", label: "Agents" },
      { href: "/lab/metered", label: "Metered spend" },
    ],
  },
  {
    label: "Verify",
    items: [
      { href: "/lab/proofs", label: "Proofs" },
      { href: "/docs", label: "SDK docs" },
    ],
  },
];

export function ProductNav({ setupLeft, exceptions }: { setupLeft: number; exceptions: number }) {
  const pathname = usePathname();

  const current = (href: string) =>
    href === "/lab" ? pathname === "/lab" : pathname.startsWith(href);

  return (
    <nav className="ui-side">
      <Link href="/" style={{ textDecoration: "none", padding: "0 10px" }} aria-label="Zowall home">
        <Wordmark size={19} />
      </Link>

      <div className="ui-side-group">
        <span className="ui-side-label">Setup</span>
        <Link href="/lab/start" aria-current={current("/lab/start") ? "page" : undefined}>
          Getting started
          {setupLeft > 0 ? <span className="ui-chip">{setupLeft} left</span> : null}
        </Link>
      </div>

      {GROUPS.map((group) => (
        <div key={group.label} className="ui-side-group">
          <span className="ui-side-label">{group.label}</span>
          {group.items.map((item) => (
            <Link
              key={item.href}
              href={item.href as "/lab"}
              aria-current={current(item.href) ? "page" : undefined}
            >
              {item.label}
              {item.href === "/lab/exceptions" && exceptions > 0 ? (
                <span className="ui-chip ui-chip--held">{exceptions}</span>
              ) : null}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
