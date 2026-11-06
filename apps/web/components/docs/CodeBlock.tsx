"use client";

import { useState } from "react";

/** A command or snippet worth copying, with the copy button where a reader looks for it. */
export function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard access can be refused; the text is on screen either way.
    }
  }

  return (
    <div style={{ position: "relative", minWidth: 0 }}>
      {label ? <div className="ui-stat-label" style={{ marginBottom: 6 }}>{label}</div> : null}
      <pre className="ui-code">{code}</pre>
      <button
        type="button"
        onClick={() => void copy()}
        className="ui-copy"
        style={{ position: "absolute", top: label ? 30 : 10, right: 12 }}
        aria-label="Copy"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
