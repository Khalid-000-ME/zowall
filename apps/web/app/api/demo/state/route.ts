import { formatUsdt } from "@zowall/gate-core";

import { getOpenHolds, getPOs, getVault } from "@/lib/chain";
import { handle } from "@/lib/demo-http";
import { serverEnv } from "@/lib/env";
import { humans } from "@/lib/humans";

export const dynamic = "force-dynamic";

/** What the walkthrough needs to know before it lets anyone press a button. */
export async function GET(request: Request) {
  return handle(request, async () => {
    const env = serverEnv();
    const missing = [
      !env.gateAddress && "GATE_ADDRESS",
      !env.deployerKey && "PRIVATE_KEY",
      !env.vendorKey && "VENDOR_PRIVATE_KEY",
      env.attestorKeys.length === 0 && "ATTESTOR_PRIVATE_KEYS",
    ].filter((m): m is string => typeof m === "string");

    const vault = env.gateAddress ? await getVault().catch(() => null) : null;

    // Where the walkthrough left off, so a refreshed page can carry on rather
    // than start a new order.
    const pos = env.gateAddress ? await getPOs().catch(() => []) : [];
    const open = pos.find((p) => p.status === "Open") ?? null;
    const holds = env.gateAddress ? await getOpenHolds().catch(() => []) : [];
    const hold = open ? (holds.find((h) => h.poId === open.id) ?? null) : null;

    return {
      enabled: env.demoEnabled && missing.length === 0,
      switchedOff: !env.demoEnabled,
      requireVerified: env.requireVerified,
      missing,
      chainId: env.chainId,
      gate: env.gateAddress,
      topic: env.hederaTopicId,
      humans: humans().map((h) => ({
        key: h.key,
        name: h.name,
        enrolled: h.enrolled,
        personId: h.personId,
      })),
      current: open
        ? {
            poId: open.id.toString(),
            qty: open.qty.toString(),
            received: open.received.toString(),
            invoiced: open.invoicedQty.toString(),
            holdId: hold ? hold.id.toString() : null,
          }
        : null,
      vault: vault
        ? {
            balance: vault.balance.toString(),
            encumbered: vault.encumbered.toString(),
            free: vault.free.toString(),
            display: {
              balance: formatUsdt(vault.balance),
              encumbered: formatUsdt(vault.encumbered),
              free: formatUsdt(vault.free),
            },
          }
        : null,
    };
  });
}
