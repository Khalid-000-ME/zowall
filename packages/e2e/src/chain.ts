/** Whitechain Sepolia, as viem needs it. Chain id and decimals verified live. */

import { defineChain } from "viem";

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

export const explorerTx = (hash: string) =>
  `https://explorer.testnet.whitechain.io/tx/${hash}`;
export const explorerAddress = (address: string) =>
  `https://explorer.testnet.whitechain.io/address/${address}`;
