/**
 * An endpoint's price, in words a person recognises.
 *
 * Quotes carry atomic units of an asset, which is exact and unreadable. HBAR has
 * eight decimals and the testnet USDC has six; anything else is shown as the raw
 * units rather than guessed at.
 */
const KNOWN: Record<string, { symbol: string; decimals: number }> = {
  "0.0.0": { symbol: "HBAR", decimals: 8 },
  "0.0.429274": { symbol: "USDC", decimals: 6 },
};

export function formatPrice(asset: string, amount: string): string {
  const a = KNOWN[asset || "0.0.0"];
  if (!a) return `${amount} units of ${asset}`;
  const n = BigInt(amount);
  const base = 10n ** BigInt(a.decimals);
  const whole = n / base;
  const frac = (n % base).toString().padStart(a.decimals, "0").replace(/0+$/, "");
  return `${whole.toString()}${frac ? `.${frac}` : ""} ${a.symbol}`;
}

export function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

export const ASSETS = [
  { id: "0.0.0", symbol: "HBAR", decimals: 8 },
  { id: "0.0.429274", symbol: "USDC", decimals: 6 },
] as const;

/** "0.0001" HBAR -> "10000" tinybars. Exact: it never goes through a float. */
export function toAtomic(asset: string, human: string): string {
  const a = ASSETS.find((x) => x.id === asset);
  if (!a) throw new Error("Choose a supported asset.");
  const m = /^(\d{1,18})(?:\.(\d{1,18}))?$/.exec(human.trim());
  if (!m) throw new Error("Enter the price as a number, such as 0.0001.");
  const frac = (m[2] ?? "").padEnd(a.decimals, "0");
  if (frac.length > a.decimals) throw new Error(`${a.symbol} has ${a.decimals} decimal places at most.`);
  const atomic = BigInt(m[1]! + frac);
  if (atomic === 0n) throw new Error("The price must be above zero.");
  return atomic.toString();
}
