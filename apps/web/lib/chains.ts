/**
 * Explorer links, keyed by chain id.
 *
 * A judge who cannot verify a claim assumes it is fake, so nothing in this app
 * renders a bare hash. Every address, transaction and topic links out.
 */

export const WHITECHAIN_SEPOLIA = 1874;

const EVM_EXPLORERS: Record<number, string> = {
  [WHITECHAIN_SEPOLIA]: "https://explorer.testnet.whitechain.io",
  11155111: "https://sepolia.etherscan.io",
};

export function explorerBase(chainId: number): string | null {
  return EVM_EXPLORERS[chainId] ?? null;
}

export function txUrl(chainId: number, hash: string): string | null {
  const base = explorerBase(chainId);
  return base ? `${base}/tx/${hash}` : null;
}

export function addressUrl(chainId: number, address: string): string | null {
  const base = explorerBase(chainId);
  return base ? `${base}/address/${address}` : null;
}

export function hashscanTopic(topicId: string, network = "testnet"): string {
  return `https://hashscan.io/${network}/topic/${topicId}`;
}

export function hashscanTx(txId: string, network = "testnet"): string {
  return `https://hashscan.io/${network}/transaction/${encodeURIComponent(txId)}`;
}

/** Shorten for display. Never shorten a value a judge has to copy exactly. */
export function truncate(value: string, lead = 6, tail = 4): string {
  if (value.length <= lead + tail + 2) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}
