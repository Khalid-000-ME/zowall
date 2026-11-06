"use client";

import { useState } from "react";

/**
 * A hash or address that proves something: truncated, linked to the explorer
 * in a new tab, with a copy button. A bare unlinked hash is a claim; this is
 * a thing you can check.
 */
export function ProofHash({
  value,
  href,
  lead = 8,
  tail = 6,
}: {
  value: string;
  href: string | null;
  lead?: number;
  tail?: number;
}) {
  const [copied, setCopied] = useState(false);
  const short = value.length > lead + tail + 2 ? `${value.slice(0, lead + 2)}…${value.slice(-tail)}` : value;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard can be refused; the full value is in the link either way.
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="ui-mono" title={value}>
          {short}
        </a>
      ) : (
        <span className="ui-mono" title={value}>
          {short}
        </span>
      )}
      <button
        type="button"
        onClick={() => void copy()}
        className="ui-copy"
        aria-label={`Copy ${value}`}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
