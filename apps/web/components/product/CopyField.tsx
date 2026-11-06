"use client";

import { useState } from "react";

/**
 * A value you are meant to paste somewhere else - an address, an endpoint, a
 * key. Shown in full rather than truncated, because a half-shown address is a
 * value you cannot use and have to go and find elsewhere.
 */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused; the value is on screen either way.
    }
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span className="ui-stat-label">{label}</span>
      <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
        <code
          className="ui-mono"
          style={{
            flex: 1,
            minWidth: 0,
            overflowX: "auto",
            whiteSpace: "nowrap",
            background: "var(--surface-sunken)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "8px 11px",
          }}
        >
          {value}
        </code>
        <button type="button" onClick={() => void copy()} className="ui-btn" style={{ flexShrink: 0 }}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
