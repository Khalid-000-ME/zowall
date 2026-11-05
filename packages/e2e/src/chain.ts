/** Whitechain Sepolia, as viem needs it. Chain id and decimals verified live. */

import { defineChain, http } from "viem";

export const whitechainSepolia = defineChain({
  id: 1874,
  name: "Whitechain Sepolia",
  nativeCurrency: { name: "WhiteBIT Coin", symbol: "WBT", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.whitechain.io"] } },
  blockExplorers: {
    default: { name: "Whitechain Explorer", url: "https://explorer.testnet.whitechain.io" },
  },
  testnet: true,
});

/**
 * The Whitechain Sepolia RPC returns intermittent 503s ("no backend is
 * currently healthy") and occasional timeouts. Mid-demo that reads as our bug,
 * so every call retries with backoff rather than failing on the first blip.
 *
 * EVM_RPC_URL overrides the default, which is what the free Ankr endpoint from
 * the prize page is for if the public one is unreliable on the day.
 */
export const transport = () =>
  http(process.env["EVM_RPC_URL"] ?? undefined, {
    retryCount: 6,
    retryDelay: 1_200,
    timeout: 30_000,
  });

export const explorerTx = (hash: string) =>
  `https://explorer.testnet.whitechain.io/tx/${hash}`;
export const explorerAddress = (address: string) =>
  `https://explorer.testnet.whitechain.io/address/${address}`;
