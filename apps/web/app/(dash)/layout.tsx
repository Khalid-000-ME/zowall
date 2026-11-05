import Link from "next/link";

/**
 * App shell. This half of the product is a tool, not a landing page, so there
 * is no hero and no floating navbar - a persistent bar that never moves is
 * what someone working through an exception queue actually wants.
 */
const NAV = [
  { href: "/po", label: "Purchase orders" },
  { href: "/holds", label: "Holds" },
  { href: "/journal", label: "Journal" },
  { href: "/attack", label: "Attack console" },
] as const;

export default function DashLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          className="page"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-5)",
            height: 56,
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 20,
              textDecoration: "none",
              letterSpacing: "-0.01em",
            }}
          >
            Zowall
          </Link>

          <nav style={{ display: "flex", gap: "var(--space-4)", fontSize: 14 }}>
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{ textDecoration: "none", color: "var(--text-muted)" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="page" style={{ paddingBlock: "var(--space-6)", flex: 1 }}>
        {children}
      </main>
    </div>
  );
}
