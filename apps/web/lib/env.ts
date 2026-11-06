/**
 * Environment, read in one place so a missing variable is a clear message and
 * not an undefined deep in a request handler.
 *
 * Nothing here is ever filled with a plausible-looking default. A build that
 * silently runs on a fake key wastes more time than a loud failure.
 */

export type ServerEnv = {
  chainId: number;
  rpcUrl: string;
  gateAddress: `0x${string}` | null;
  /** first block of the gate; bounds log scans */
  gateDeployBlock: bigint | null;
  /** lets the walkthrough and attack console submit real transactions */
  demoEnabled: boolean;
  /** the attestor signs only for people who have verified with World ID */
  requireVerified: boolean;
  deployerKey: `0x${string}` | null;
  vendorKey: `0x${string}` | null;
  hederaAccountId: string | null;
  hederaKey: string | null;
  hederaSubmitKey: string | null;
  usdtAddress: `0x${string}` | null;
  /** The attestor quorum's keys. In production each is a separate service. */
  attestorKeys: `0x${string}`[];
  attestorThreshold: number;
  hederaTopicId: string | null;
  worldRpId: string | null;
};

function hex(value: string | undefined): `0x${string}` | null {
  return value && /^0x[0-9a-fA-F]+$/.test(value) ? (value as `0x${string}`) : null;
}

export function serverEnv(): ServerEnv {
  return {
    chainId: Number(process.env.EVM_CHAIN_ID ?? 1874),
    rpcUrl: process.env.EVM_RPC_URL ?? "https://rpc.testnet.whitechain.io",
    gateAddress: hex(process.env.GATE_ADDRESS),
    gateDeployBlock: process.env.GATE_DEPLOY_BLOCK ? BigInt(process.env.GATE_DEPLOY_BLOCK) : null,
    demoEnabled: process.env.DEMO_ENABLED === "true",
    requireVerified: process.env.WORLD_REQUIRE_VERIFIED === "true",
    deployerKey: hex(process.env.PRIVATE_KEY),
    vendorKey: hex(process.env.VENDOR_PRIVATE_KEY),
    hederaAccountId: process.env.HEDERA_ACCOUNT_ID ?? null,
    hederaKey: process.env.HEDERA_PRIVATE_KEY ?? null,
    hederaSubmitKey: process.env.HEDERA_SUBMIT_KEY ?? null,
    usdtAddress: hex(process.env.USDT_ADDRESS),
    attestorKeys: (process.env.ATTESTOR_PRIVATE_KEYS ?? process.env.ATTESTOR_PRIVATE_KEY ?? "")
      .split(",")
      .map((k) => hex(k.trim()))
      .filter((k): k is `0x${string}` => k !== null),
    attestorThreshold: Number(process.env.ATTESTOR_THRESHOLD ?? "1"),
    hederaTopicId: process.env.HEDERA_TOPIC_ID ?? null,
    worldRpId: process.env.WORLD_RP_ID ?? null,
  };
}

/** What is not configured yet, for the setup banner and the health route. */
export function missing(env: ServerEnv): string[] {
  return [
    !env.gateAddress && "GATE_ADDRESS",
    !env.usdtAddress && "USDT_ADDRESS",
    env.attestorKeys.length === 0 && "ATTESTOR_PRIVATE_KEYS",
    !env.hederaTopicId && "HEDERA_TOPIC_ID",
    !env.worldRpId && "WORLD_RP_ID",
  ].filter((v): v is string => typeof v === "string");
}
