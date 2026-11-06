"use client";

import { useState } from "react";

import { OutcomeBadge } from "@/components/Outcome";
import { ResultCard } from "@/components/ResultCard";
import type { StepResult } from "@/lib/demo";

type Sample = { label: string; text: string };

type Attempt = {
  narration: string;
  result?: StepResult;
  outcome?: "PAID" | "HELD" | "REJECTED";
  codes?: string[];
  explanation?: string;
  evaluatedBy?: string;
};

export function AttackConsole({
  samples,
  topicUrl,
}: {
  samples: Sample[];
  topicUrl: string | null;
}) {
  const [text, setText] = useState(samples[0]?.text ?? "");
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setRunning(true);
    setAttempt(null);
    setError(null);
    try {
      const res = await fetch("/api/attack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = (await res.json()) as Attempt & { ok: boolean; error?: string };
      if (!data.ok) setError(data.error ?? "the console could not reach the gate");
      else setAttempt(data);
    } catch (err) {
      setError(`The console could not reach the gate: ${String(err)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "var(--space-4)", maxWidth: 760 }}>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        {samples.map((s) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setText(s.text)}
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text-muted)",
              borderRadius: "var(--radius-sm)",
              padding: "4px 10px",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        spellCheck={false}
        style={{
          width: "100%",
          padding: "var(--space-3)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius)",
          background: "var(--surface)",
          color: "var(--text)",
          font: "inherit",
          resize: "vertical",
        }}
      />

      <button
        type="button"
        onClick={submit}
        disabled={running || text.trim() === ""}
        style={{
          justifySelf: "start",
          background: "var(--accent)",
          color: "var(--accent-text)",
          border: "none",
          borderRadius: "var(--radius-sm)",
          padding: "10px 18px",
          fontSize: 15,
          cursor: running ? "wait" : "pointer",
          opacity: running ? 0.7 : 1,
        }}
      >
        {running ? "Agent is trying…" : "Let the agent try"}
      </button>

      {error ? (
        <p style={{ color: "var(--rejected)", margin: 0 }}>{error}</p>
      ) : null}

      {attempt ? (
        <div style={{ display: "grid", gap: "var(--space-3)" }}>
          <p style={{ margin: 0, color: "var(--text-muted)", fontStyle: "italic" }}>
            {attempt.narration}
          </p>

          {attempt.result ? (
            <ResultCard result={attempt.result} names={{}} topicUrl={topicUrl} />
          ) : attempt.outcome ? (
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: "var(--space-4)",
                background: "var(--surface)",
                display: "grid",
                gap: "var(--space-3)",
              }}
            >
              <OutcomeBadge outcome={attempt.outcome} large />
              {attempt.codes && attempt.codes.length > 0 ? (
                <p className="mono" style={{ margin: 0 }}>
                  {attempt.codes.join("  ")}
                </p>
              ) : null}
              <p style={{ margin: 0 }}>{attempt.explanation}</p>
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-faint)" }}>
                {attempt.evaluatedBy}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
