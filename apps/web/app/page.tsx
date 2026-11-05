import Link from "next/link";
import { REASON_CODES, REASON_TEXT, SEVERITY } from "@zowall/gate-core";

import { SiteNav } from "@/components/SiteNav";

/**
 * One tagline, carried identically by the hero, the metadata, the README and
 * the demo narration. If this line changes, all four change together.
 */
const TAGLINE = "No PO, no pay.";
const TAGLINE_TECH = "USDT on Whitechain, refusals on Hedera HCS.";

export default function Home() {
  const hard = REASON_CODES.filter((c) => SEVERITY[c] === "hard");
  const soft = REASON_CODES.filter((c) => SEVERITY[c] === "soft");

  return (
    <>
      <SiteNav />

      <section
        style={{
          minHeight: "92dvh",
          display: "grid",
          alignContent: "center",
          paddingBlock: "var(--space-8)",
        }}
        className="page"
      >
        <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 15 }}>
          Three-way invoice match for agents that hold a wallet
        </p>

        <h1
          style={{
            fontSize: "clamp(2.6rem, 8vw, 5rem)",
            lineHeight: 1.05,
            margin: "var(--space-4) 0 var(--space-3)",
            maxWidth: "22ch",
          }}
        >
          {TAGLINE}
        </h1>

        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(1.1rem, 2.6vw, 1.6rem)",
            color: "var(--text-muted)",
            margin: "0 0 var(--space-4)",
          }}
        >
          {TAGLINE_TECH}
        </p>

        <p
          style={{
            color: "var(--text-muted)",
            maxWidth: "var(--measure)",
            fontSize: 17,
            marginTop: 0,
          }}
        >
          Finance never pays an invoice that does not match the purchase order and the goods
          receipt. Your agents pay everything. This is the missing check, as a contract.
        </p>

        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            marginTop: "var(--space-5)",
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/attack"
            style={{
              background: "var(--accent)",
              color: "var(--accent-text)",
              padding: "12px 22px",
              borderRadius: "var(--radius-sm)",
              textDecoration: "none",
              fontSize: 16,
            }}
          >
            Try to break it
          </Link>
          <Link
            href="/po"
            style={{
              border: "1px solid var(--border-strong)",
              padding: "12px 22px",
              borderRadius: "var(--radius-sm)",
              textDecoration: "none",
              fontSize: 16,
            }}
          >
            See the dashboard
          </Link>
        </div>

        {/*
          Sponsor marks go here: a quiet "Built with" row of the real
          Whitechain, Hedera and World logos, from their own brand kits, in
          public/brands/. Not added yet - a redrawn mark is worse than none.
        */}
      </section>

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
