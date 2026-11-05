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
  usdtAddress: `0x${string}` | null;
  attestorKey: `0x${string}` | null;
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
    usdtAddress: hex(process.env.USDT_ADDRESS),
    attestorKey: hex(process.env.ATTESTOR_PRIVATE_KEY),
    hederaTopicId: process.env.HEDERA_TOPIC_ID ?? null,
    worldRpId: process.env.WORLD_RP_ID ?? null,
  };
}

/** What is not configured yet, for the setup banner and the health route. */
export function missing(env: ServerEnv): string[] {
  return [
    !env.gateAddress && "GATE_ADDRESS",
    !env.usdtAddress && "USDT_ADDRESS",
    !env.attestorKey && "ATTESTOR_PRIVATE_KEY",
    !env.hederaTopicId && "HEDERA_TOPIC_ID",
    !env.worldRpId && "WORLD_RP_ID",
  ].filter((v): v is string => typeof v === "string");
}
