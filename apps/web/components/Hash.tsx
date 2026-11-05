"use client";

import { useState } from "react";
import { truncate } from "@/lib/chains";

/**
 * Never render a bare hash. Truncated for reading, copyable in full, and
 * linked to the right explorer when there is one.
 */
export function Hash({
  value,
  href,
  label,
}: {
  value: string;
  href?: string | null;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard blocked; the full value is in the title attribute
    }
  }

  const text = (
    <span className="mono" title={value}>
      {label ?? truncate(value)}
    </span>
  );

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
          {text}
        </a>
      ) : (
        text
      )}
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${value}`}
        style={{
          border: "1px solid var(--border)",
          background: "transparent",
          color: "var(--text-faint)",
          borderRadius: 4,
          fontSize: 10,
          padding: "1px 5px",
          cursor: "pointer",
        }}
      >
        {copied ? "copied" : "copy"}
      </button>
    </span>
  );
}
