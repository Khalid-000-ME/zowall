import type { Metadata } from "next";

import { AppNav } from "@/components/account/AppNav";
import { requireAccount } from "@/lib/session";

import "../ui.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Zowall",
  description: "Register x402 endpoints, manage your API keys, and use the SDK.",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const account = await requireAccount();

  return (
    <div className="ui ui-shell">
      <AppNav role={account.role} name={account.name} email={account.email} />
      <main className="ui-main">
        <div className="ui-main-inner">{children}</div>
      </main>
    </div>
  );
}
