import type { Outcome } from "@zowall/gate-core";

const STYLE: Record<Outcome, { bg: string; fg: string }> = {
  PAID: { bg: "var(--paid-bg)", fg: "var(--paid)" },
  HELD: { bg: "var(--held-bg)", fg: "var(--held)" },
  REJECTED: { bg: "var(--rejected-bg)", fg: "var(--rejected)" },
};

/** One colour per outcome, never reused for decoration. */
export function OutcomeBadge({ outcome, large }: { outcome: Outcome; large?: boolean }) {
  const style = STYLE[outcome];
  return (
    <span
      style={{
        background: style.bg,
        color: style.fg,
        padding: large ? "6px 14px" : "2px 8px",
        borderRadius: "var(--radius-sm)",
        fontSize: large ? 18 : 12,
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {outcome}
    </span>
  );
}
