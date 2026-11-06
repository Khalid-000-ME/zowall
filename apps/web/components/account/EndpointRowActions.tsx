"use client";

import { useState, useTransition } from "react";

import { removeEndpointAction, verifyEndpointAction } from "@/app/app/actions";

export function EndpointRowActions({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (job: () => Promise<{ error?: string }>) =>
    start(async () => {
      const r = await job();
      setError(r.error ?? null);
    });

  return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <button type="button" className="ui-btn" disabled={pending} onClick={() => run(() => verifyEndpointAction(id))}>
        {pending ? "Checking…" : "Verify again"}
      </button>
      <button
        type="button"
        className="ui-btn"
        disabled={pending}
        onClick={() => {
          if (confirm("Remove this endpoint from the registry?")) run(() => removeEndpointAction(id));
        }}
      >
        Remove
      </button>
      {error ? <span className="ui-faint" style={{ fontSize: 12.5 }}>{error}</span> : null}
    </span>
  );
}
