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
