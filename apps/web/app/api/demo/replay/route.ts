import { keccak256 } from "viem";
import { evmSourceFromChain, replay } from "@zowall/journal";

import { handle } from "@/lib/demo-http";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Run the same reconciliation the CLI runs: pull every entry from the Hedera
 * topic, recompute each decision's digest from the chain's own logs with
 * gate-core, and compare. Read-only and credential-free by design.
 */
export async function POST(request: Request) {
  return handle(request, async () => {
    const env = serverEnv();
    if (!env.hederaTopicId || !env.gateAddress) {
      return { report: null, error: "topic or gate not configured" };
    }

    const { source, count } = await evmSourceFromChain({
      rpcUrl: env.rpcUrl,
      gateAddress: env.gateAddress,
      ...(env.gateDeployBlock !== null ? { fromBlock: env.gateDeployBlock } : {}),
    });

    const report = await replay(env.hederaTopicId, {
      keccak256: (data) => keccak256(data),
      chainId: env.chainId,
      gateAddress: env.gateAddress,
      evmSource: source,
    });

    return { report, chainDecisions: count };
  });
}
