"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/po", label: "Dashboard" },
  { href: "/attack", label: "Attack console" },
  { href: "/journal", label: "Journal" },
] as const;

/**
 * No bar over the hero - the hero owns the top of the screen. After scrolling
 * past it, a bar fades in, detached from the top edge and inset from the
 * sides, so it reads as its own floating element.
 */
export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      style={{
        position: "fixed",
        inset: "0 0 auto 0",
        zIndex: 50,
        display: "flex",
        justifyContent: "center",
        paddingTop: scrolled ? 12 : 24,
        transition: "padding 300ms ease-out",
      }}
    >
      <nav
        style={{
          width: "min(1100px, calc(100% - 2rem))",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--space-4)",
          padding: "12px 20px",
          // rounded-2xl reads as a floating bar; a full capsule would be wrong
          borderRadius: 16,
          border: `1px solid ${scrolled ? "var(--border)" : "transparent"}`,
          background: scrolled ? "color-mix(in srgb, var(--bg) 78%, transparent)" : "transparent",
          backdropFilter: scrolled ? "blur(16px)" : "none",
          boxShadow: scrolled ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
          transition: "background 300ms ease-out, border-color 300ms ease-out",
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            textDecoration: "none",
            letterSpacing: "-0.01em",
          }}
        >
          Zowall
        </Link>

        <div style={{ display: "flex", gap: "var(--space-4)", fontSize: 14, flexWrap: "wrap" }}>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} style={{ textDecoration: "none" }}>
              {l.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
