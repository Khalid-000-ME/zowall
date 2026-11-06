/**
 * The mark: three documents, the third out of line.
 *
 * Inherits colour via currentColor so it survives on either theme, and the
 * misalignment is what still reads at favicon size.
 */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Zowall"
      style={{ display: "block", flexShrink: 0 }}
    >
      <rect x="4" y="6" width="20" height="4" rx="1.5" fill="currentColor" />
      <rect x="4" y="14" width="20" height="4" rx="1.5" fill="currentColor" />
      <rect x="11" y="22" width="20" height="4" rx="1.5" fill="currentColor" opacity="0.55" />
    </svg>
  );
}

/** Mark plus name, for the navbar and the app shell. */
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
      <Logo size={size * 0.95} />
      <span
        style={{
          fontFamily: "var(--font-brand), var(--font-display), sans-serif",
          fontWeight: 700,
          fontSize: size * 0.92,
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        Zowall
      </span>
    </span>
  );
}
