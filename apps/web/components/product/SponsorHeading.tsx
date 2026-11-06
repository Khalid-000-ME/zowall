/**
 * A sponsor's official mark beside the section that documents how it is used.
 *
 * Marks are the originals from each organisation's own published site (see
 * public/brands/SOURCES.md), never redrawn. They sit inline with the feature
 * that uses them, which is what shows real integration, and they are
 * deliberately small and subordinate: this says what the product is built
 * with, not that anyone endorses it.
 */
const MARKS = {
  hedera: { name: "Hedera", href: "https://hedera.com", light: "/brands/hedera.svg", dark: "/brands/hedera-white.svg", height: 24 },
  world: { name: "World", href: "https://world.org", light: "/brands/world.svg", dark: "/brands/world-white.svg", height: 22 },
  whitechain: { name: "Whitechain", href: "https://whitechain.io", light: "/brands/whitechain.png", dark: "/brands/whitechain-dark.png", height: 20 },
} as const;

export type Sponsor = keyof typeof MARKS;

export function SponsorMark({ sponsor }: { sponsor: Sponsor }) {
  const m = MARKS[sponsor];
  return (
    <a href={m.href} target="_blank" rel="noreferrer" aria-label={m.name} className="ui-mark">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcSet={m.dark} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.light} alt={m.name} style={{ height: m.height, display: "block" }} />
      </picture>
    </a>
  );
}
