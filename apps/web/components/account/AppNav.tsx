"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { logoutAction } from "@/app/(auth)/actions";
import { Wordmark } from "@/components/Logo";

type Item = { href: string; label: string; external?: boolean };

export function AppNav({ role, name, email }: { role: "vendor" | "buyer"; name: string; email: string }) {
  const pathname = usePathname();

  const main: Item[] =
    role === "vendor"
      ? [
          { href: "/app", label: "Overview" },
          { href: "/app/endpoints", label: "Endpoints" },
          { href: "/app/keys", label: "API keys" },
        ]
      : [
          { href: "/app", label: "Overview" },
          { href: "/app/keys", label: "API keys" },
        ];

  const more: Item[] = [
    { href: "/registry", label: "Registry" },
    { href: "/docs", label: "Docs" },
  ];

  const current = (href: string) => (href === "/app" ? pathname === "/app" : pathname.startsWith(href));

  return (
    <nav className="ui-side">
      <Link href="/" style={{ textDecoration: "none", padding: "0 10px" }} aria-label="Zowall home">
        <Wordmark size={19} />
      </Link>

      <div className="ui-side-group">
        <span className="ui-side-label">{role === "vendor" ? "Selling" : "Buying"}</span>
        {main.map((i) => (
          <Link key={i.href} href={i.href as "/app"} aria-current={current(i.href) ? "page" : undefined}>
            {i.label}
          </Link>
        ))}
      </div>

      <div className="ui-side-group">
        <span className="ui-side-label">Resources</span>
        {more.map((i) => (
          <Link key={i.href} href={i.href as "/docs"}>
            {i.label}
          </Link>
        ))}
      </div>

      <div style={{ marginTop: "auto", padding: "0 10px", display: "grid", gap: 8 }}>
        <div style={{ fontSize: 13.5, lineHeight: 1.35 }}>
          <div>{name}</div>
          <div className="ui-faint" style={{ fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis" }}>
            {email}
          </div>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="ui-btn" style={{ width: "100%" }}>
            Log out
          </button>
        </form>
      </div>
    </nav>
  );
}
