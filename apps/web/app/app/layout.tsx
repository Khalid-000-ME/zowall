import type { Metadata } from "next";

import { ProductNav } from "@/components/product/ProductNav";
import { getOpenHolds } from "@/lib/chain";
import { workspaceState } from "@/lib/product";

import "./product.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Zowall workspace",
  description: "Set up the gate, connect an agent, and work the exceptions it raises.",
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
