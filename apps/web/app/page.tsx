import Image from "next/image";
import Link from "next/link";

import { Hero } from "@/components/Hero";
import { LandingStory } from "@/components/LandingStory";
import { SiteNav } from "@/components/SiteNav";

/**
 * One tagline, carried identically by the hero, the metadata and the README.
 * If this line changes, all three change together.
 */
const TAGLINE = "No PO, no pay.";
const TAGLINE_TECH = "USDT on Whitechain, refusals on Hedera HCS.";

export default function Home() {
  return (
    <div className="land">
      <SiteNav overDark />

      <Hero tagline={TAGLINE} taglineTech={TAGLINE_TECH} />

      <section className="land-shot">
        <div className="page">
          <h2 className="land-shot-title">A hosted checkout for your buyers.</h2>
          <p className="land-shot-sub">Send a buyer to a page like this. Zowall checks the invoice and settles it.</p>
          <div className="land-shot-frame">
            <Image
              src="/checkout-paid.png"
              alt="The Zowall hosted checkout after a payment: 0.10 USDT sent in a single transaction, with a link to the transaction."
              width={2560}
              height={1600}
              sizes="(min-width: 1100px) 1040px, 92vw"
              priority={false}
            />
          </div>
        </div>
      </section>

      <LandingStory />

      <footer className="land-footer">
        <div className="page land-links">
          <a href="https://github.com/Khalid-000-ME" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <Link href="/docs">Docs</Link>
          <Link href="/registry">Registry</Link>
          <Link href="/journal">Journal</Link>
        </div>
        <p className="land-wordmark" aria-hidden="true">
          zowall
        </p>
      </footer>
    </div>
  );
}
