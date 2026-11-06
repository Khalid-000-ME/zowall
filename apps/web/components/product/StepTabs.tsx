"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { SetupStep } from "@/lib/product";

/**
 * The setup tab bar.
 *
 * The step number doubles as the progress marker - filled once the step is
 * satisfied - so the row never needs an icon set, and a glance tells you what
 * is left without opening anything.
 */
export function StepTabs({ steps }: { steps: SetupStep[] }) {
  const pathname = usePathname();

  return (
    <div className="ui-tabs" role="navigation" aria-label="Setup steps">
      {steps.map((step) => {
        const href = `/app/start/${step.slug}`;
        const current = pathname === href;
        return (
          <Link
            key={step.slug}
            href={href as "/app/start"}
            className="ui-tab"
            aria-current={current ? "page" : undefined}
          >
            <span className={`ui-tab-n${step.done ? " ui-tab-n--done" : ""}`}>
              {step.done ? "✓" : step.n}
            </span>
            {step.title}
          </Link>
        );
      })}
    </div>
  );
}
