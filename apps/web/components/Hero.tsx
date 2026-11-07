"use client";

import Link from "next/link";

import GradientASCII from "@/components/reactbits/GradientASCII";

/**
 * The landing hero.
 *
 * The art is the react-bits GradientASCII (JS-CSS) running the same `rise`
 * variation the Fala landing uses - same shape, glyph ramp, cell size and
 * density - and the same blue ramp.
 *
 * Colours are the navy-and-blue palette used across these projects, so the
 * page reads as one family. The workspace behind /app stays light on purpose.
 */
const BRANDS = [
  { name: "Whitechain", href: "https://whitechain.io", src: "/brands/whitechain-dark.png", height: 22 },
  { name: "Hedera", href: "https://hedera.com", src: "/brands/hedera-white.svg", height: 26 },
  { name: "World", href: "https://world.org", src: "/brands/world-white.svg", height: 24 },
] as const;

export function Hero({ tagline, taglineTech }: { tagline: string; taglineTech: string }) {
  return (
    <section className="hero">
      <div className="hero-art" aria-hidden="true">
        <GradientASCII
          colors={["#0b1f6b", "#1e3fd8", "#2f6bff", "#7db4ff"]}
          shape="rise"
          characters=" =+xX0S8#@"
          cellSize={18}
          density={0.8}
        />
        <div className="hero-dim" />
      </div>

      <div className="page hero-body">
        <p className="hero-eyebrow">Payments for x402 endpoints and the agents that pay them</p>

        <h1 className="hero-title">{tagline}</h1>

        <p className="hero-sub">{taglineTech}</p>

        <p className="hero-lede">
          Finance never pays a quote nobody ordered. Zowall puts the purchase order, the receipt and
          the invoice on chain, so an agent can only pay what a person ordered.
        </p>

        <div className="hero-actions">
          <Link href="/signup?role=vendor" className="hero-btn hero-btn-primary">
            Start selling
          </Link>
          <Link href="/signup?role=buyer" className="hero-btn hero-btn-ghost">
            Start buying
          </Link>
        </div>

        <div className="hero-brands" aria-label="Built with">
          <span className="hero-brand-label">Built with</span>
          {BRANDS.map((b) => (
            <a key={b.name} href={b.href} target="_blank" rel="noreferrer" aria-label={b.name}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.src} alt={b.name} style={{ height: b.height }} />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
