import { formatUsdt } from "@zowall/gate-core";

import { getVault } from "@/lib/chain";
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
      !env.attestorKey && "ATTESTOR_PRIVATE_KEY",
    ].filter((m): m is string => typeof m === "string");

    const vault = env.gateAddress ? await getVault().catch(() => null) : null;

    return {
      enabled: env.demoEnabled && missing.length === 0,
      switchedOff: !env.demoEnabled,
      missing,
      chainId: env.chainId,
      gate: env.gateAddress,
      topic: env.hederaTopicId,
      humans: humans().map((h) => ({ key: h.key, name: h.name, enrolled: h.enrolled })),
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
