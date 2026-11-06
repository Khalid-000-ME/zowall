import type { Outcome } from "@zowall/gate-core";

/** One colour per outcome, used nowhere else in the workspace. */
const STYLE: Record<Outcome, { cls: string; label: string }> = {
  PAID: { cls: "ui-chip ui-chip--ok", label: "Paid" },
  HELD: { cls: "ui-chip ui-chip--held", label: "Held" },
  REJECTED: { cls: "ui-chip ui-chip--bad", label: "Refused" },
};

export function OutcomeChip({ outcome }: { outcome: Outcome }) {
  const s = STYLE[outcome];
  return (
    <span className={s.cls}>
      <span className="ui-dot" />
      {s.label}
    </span>
  );
}
