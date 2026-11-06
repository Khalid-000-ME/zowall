import Link from "next/link";
import { REASON_CODES, REASON_TEXT, SEVERITY } from "@zowall/gate-core";

import { Hero } from "@/components/Hero";
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
    <>
      <SiteNav overDark />

      <Hero tagline={TAGLINE} taglineTech={TAGLINE_TECH} />

      <section
        className="page"
        style={{ paddingBlock: "var(--space-8)", borderTop: "1px solid var(--border)" }}
      >
        <h2 style={{ fontSize: 28, maxWidth: "20ch" }}>Eleven ways an invoice can be wrong</h2>
        <p style={{ color: "var(--text-muted)", maxWidth: "var(--measure)" }}>
          Every one of them returns, not just the first. Eight stop the payment outright. Three
          park it for a different human to look at.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "var(--space-4)",
            marginTop: "var(--space-5)",
          }}
        >
          {[
            { title: "Refused outright", codes: hard, colour: "var(--rejected)" },
            { title: "Held for review", codes: soft, colour: "var(--held)" },
          ].map((group) => (
            <div
              key={group.title}
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "var(--space-4)",
                background: "var(--surface)",
              }}
            >
              <h3 style={{ fontFamily: "var(--font-body)", fontSize: 15, color: group.colour }}>
                {group.title}
              </h3>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
                {group.codes.map((code) => (
                  <li key={code} style={{ fontSize: 14 }}>
                    <span className="mono" style={{ fontSize: 12, color: "var(--text-faint)" }}>
                      {code}
                    </span>
                    <br />
                    {REASON_TEXT[code]}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <footer
        style={{
          borderTop: "1px solid var(--border)",
          paddingBlock: "var(--space-6)",
          marginTop: "var(--space-7)",
        }}
      >
        <div className="page">
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "clamp(3rem, 14vw, 8rem)",
              lineHeight: 0.9,
              color: "var(--border-strong)",
              margin: 0,
            }}
          >
            Zowall
          </p>
          <div
            style={{
              display: "flex",
              gap: "var(--space-4)",
              fontSize: 14,
              marginTop: "var(--space-4)",
              flexWrap: "wrap",
            }}
          >
            <a href="https://github.com/Khalid-000-ME" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <Link href="/journal">Journal</Link>
            <Link href="/api/export">Export</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
