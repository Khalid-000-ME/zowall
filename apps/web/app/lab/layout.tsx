import type { Metadata } from "next";

import { ProductNav } from "@/components/product/ProductNav";
import { getOpenHolds } from "@/lib/chain";
import { workspaceState } from "@/lib/product";

import "../ui.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Zowall lab",
  description: "The gate's internals, run against the real chain.",
};

export default async function ProductLayout({ children }: { children: React.ReactNode }) {
  const state = await workspaceState();

  let open = 0;
  try {
    open = (await getOpenHolds()).length;
  } catch {
    // The sidebar badge is not worth failing a page over.
  }

  return (
    <div className="ui ui-shell">
      <ProductNav setupLeft={state.steps.filter((s) => !s.done).length} exceptions={open} />
      <main className="ui-main">
        <div className="ui-main-inner">{children}</div>
      </main>
    </div>
  );
}
