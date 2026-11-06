/**
 * The runner uses the gate's generated ABI, so it can never drift from the
 * contract. A hand-kept slice of it did drift once: it kept the old attestation
 * struct after the contract gained an action hash, and every call reverted at
 * decode time. `abi-v1.ts` is the frozen v1 slice, used only to recover funds
 * from a gate deployed before that change.
 */
export { GATE_ABI } from "@zowall/sdk";

export const ERC20_ABI = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;
