import Link from "next/link";

import { StepTabs } from "@/components/product/StepTabs";
import { workspaceState } from "@/lib/product";

export const dynamic = "force-dynamic";

/**
 * Wraps the four setup steps only. The hub at /lab/start sits outside this
 * group so it is not a tab of itself.
 */
export default async function StepsLayout({ children }: { children: React.ReactNode }) {
  const state = await workspaceState();

  return (
    <>
      <header style={{ marginBottom: "var(--space-6)" }}>
        <Link href="/lab/start" className="ui-eyebrow" style={{ textDecoration: "none" }}>
          ← Getting started
        </Link>
        <StepTabs steps={state.steps} />
      </header>
      {children}
    </>
  );
}
