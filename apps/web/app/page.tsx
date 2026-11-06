import Link from "next/link";
import { REASON_CODES, REASON_TEXT, SEVERITY } from "@zowall/gate-core";

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
  const hard = REASON_CODES.filter((c) => SEVERITY[c] === "hard");
  const soft = REASON_CODES.filter((c) => SEVERITY[c] === "soft");

  return (
    <div className="land">
      <SiteNav overDark />

      <Hero tagline={TAGLINE} taglineTech={TAGLINE_TECH} />

      <LandingStory />

      <section className="land-section">
        <h2 className="land-h2">Eleven ways an invoice can be wrong.</h2>
        <p className="land-lede">
          Every one of them returns, not just the first. Eight stop the payment outright. Three
          park it for a different human to look at.
        </p>

        <div className="land-codes">
          {[
            { title: "Refused outright", codes: hard, colour: "#f87171" },
            { title: "Held for review", codes: soft, colour: "#fbbf24" },
          ].map((group) => (
            <div key={group.title} className="land-code-group">
              <h3 style={{ color: group.colour }}>{group.title}</h3>
              <ul className="land-code-list">
                {group.codes.map((code) => (
                  <li key={code}>
                    <span className="mono">{code}</span>
                    {REASON_TEXT[code]}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <footer className="land-footer">
        <div className="page">
          <p className="land-wordmark">Zowall</p>
          <div className="land-links">
            <a href="https://github.com/Khalid-000-ME" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <Link href="/journal">Journal</Link>
            <Link href="/api/export">Export</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
