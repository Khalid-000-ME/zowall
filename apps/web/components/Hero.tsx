"use client";

import Link from "next/link";

import GradientASCII from "@/components/reactbits/GradientASCII";

/**
 * The landing hero.
 *
 * The art is the react-bits GradientASCII (JS-CSS) running the same `rise`
 * variation the Fala landing uses - same shape, glyph ramp, cell size and
 * density - with Zowall's ink-to-cream palette instead of Fala's blues, so
 * the two projects do not look like the same site.
 *
 * It is a dark band in an otherwise light app. That is deliberate: it is the
 * only place in the product where decoration is the point, and the contrast
 * is what makes the dashboards that follow read as quiet.
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
          colors={["#14110d", "#6b4a12", "#c9922f", "#f3e6c9"]}
          shape="rise"
          characters=" =+xX0S8#@"
          cellSize={18}
          density={0.8}
        />
        <div className="hero-dim" />
      </div>

      <div className="page hero-body">
        <p className="hero-eyebrow">Three-way invoice match for agents that hold a wallet</p>

        <h1 className="hero-title">{tagline}</h1>

        <p className="hero-sub">{taglineTech}</p>

        <p className="hero-lede">
          Finance never pays an invoice that does not match the purchase order and the goods
          receipt. Your agents pay everything. This is the missing check, as a contract.
        </p>

        <div className="hero-actions">
          <Link href="/app" className="hero-btn hero-btn-primary">
            Open the app
          </Link>
          <Link href="/walkthrough" className="hero-btn hero-btn-ghost">
            See how it works
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
