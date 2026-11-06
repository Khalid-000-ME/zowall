"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { AsciiShape, type ShapeName } from "@/components/AsciiShape";

/** Rises into place once, when it first comes into view. */
function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal${seen ? " reveal-in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/** Marks are the white originals from public/brands, never redrawn. */
const MARKS = {
  whitechain: { name: "Whitechain", src: "/brands/whitechain-dark.png", height: 18 },
  world: { name: "World", src: "/brands/world-white.svg", height: 20 },
  hedera: { name: "Hedera", src: "/brands/hedera-white.svg", height: 22 },
} as const;

const CARDS: ReadonlyArray<{
  shape: ShapeName;
  title: string;
  body: string;
  mark: keyof typeof MARKS;
  uses: string;
}> = [
  {
    shape: "ledger",
    title: "Ordered",
    body: "A purchase order reserves the money before anything is bought. A vendor can check it on-chain before they ship.",
    mark: "whitechain",
    uses: "USDT reserved on Whitechain",
  },
  {
    shape: "envelope",
    title: "Received",
    body: "A second person signs that the goods, or the calls, actually arrived. Never the person who placed the order.",
    mark: "world",
    uses: "A distinct human, by World ID",
  },
  {
    shape: "lock",
    title: "Refused",
    body: "An invoice that matches neither is stopped before any money moves, and the refusal is a transaction anyone can open.",
    mark: "hedera",
    uses: "Every refusal journalled on HCS",
  },
];

export function LandingStory() {
  return (
    <>
      <section className="land-section land-split">
        <Reveal>
          <h2 className="land-h2">Your agent has a wallet and no accounts payable.</h2>
          <p className="land-lede">
            A spend cap checks the amount. An allowlist checks the counterparty. None of them check
            whether the thing was ever ordered, or ever arrived.
          </p>
        </Reveal>
        <Reveal className="land-art" delay={120}>
          <AsciiShape shape="coin" cols={88} rows={42} />
        </Reveal>
      </section>

      <section className="land-section land-cards">
        {CARDS.map((card, i) => (
          <Reveal key={card.title} delay={i * 120}>
            <article className="land-card">
              <div className="land-card-art">
                <AsciiShape shape={card.shape} cols={58} rows={27} speed={0.8 + i * 0.2} />
              </div>
              <div className="land-card-body">
                <h3 className="land-card-title">{card.title}</h3>
                <p className="land-card-text">{card.body}</p>
                <Link href="/app/proofs" className="land-card-mark" aria-label={`${MARKS[card.mark].name}: ${card.uses}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={MARKS[card.mark].src} alt={MARKS[card.mark].name} style={{ height: MARKS[card.mark].height }} />
                  <span>{card.uses}</span>
                </Link>
              </div>
            </article>
          </Reveal>
        ))}
      </section>

      <section className="land-section land-split">
        <Reveal className="land-art land-art-first">
          <AsciiShape shape="clock" cols={88} rows={42} />
        </Reveal>
        <Reveal delay={120}>
          <h2 className="land-h2">A matched invoice pays in seconds, not net-60.</h2>
          <p className="land-lede">
            The delay in accounts payable is the checking, not the banking. When the check is a
            contract, a clean invoice settles as fast as a wrong one is refused.
          </p>
        </Reveal>
      </section>
    </>
  );
}
