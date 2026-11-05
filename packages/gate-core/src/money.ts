/** Integer money and tolerance math. No floats anywhere near a payment. */

export const USDT_DECIMALS = 6;
const SCALE = 1_000_000n;
export const BPS_DENOMINATOR = 10_000n;

/** `usdt(40)` -> 40_000_000n. Accepts a decimal string for fractional amounts. */
export function usdt(amount: number | string): bigint {
  return parseUsdt(String(amount));
}

export function parseUsdt(input: string): bigint {
  const s = input.trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`not a decimal amount: ${input}`);
  const neg = s.startsWith("-");
  const [whole = "0", frac = ""] = (neg ? s.slice(1) : s).split(".");
  if (frac.length > USDT_DECIMALS) {
    throw new Error(`more than ${USDT_DECIMALS} decimal places: ${input}`);
  }
  const v = BigInt(whole) * SCALE + BigInt(frac.padEnd(USDT_DECIMALS, "0") || "0");
  return neg ? -v : v;
}

/** `formatUsdt(40_000_000n)` -> "40.00". Trailing zeros kept to 2dp for display. */
export function formatUsdt(value: bigint, decimals = 2): string {
  const neg = value < 0n;
  const v = neg ? -value : value;
  const whole = v / SCALE;
  const frac = (v % SCALE).toString().padStart(USDT_DECIMALS, "0");
  const shown = decimals === 0 ? "" : `.${frac.slice(0, decimals)}`;
  return `${neg ? "-" : ""}${whole}${shown}`;
}

/** qty * unitPrice, both integers, no rounding to go wrong. */
export function lineTotal(qty: bigint, unitPrice: bigint): bigint {
  return qty * unitPrice;
}

/**
 * The highest value still inside tolerance.
 * Floor division, so the tolerance never rounds in the payer's disfavour:
 * 40_000_000 at 500bps -> 42_000_000 exactly.
 */
export function withTolerance(base: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0) throw new Error(`bad bps: ${bps}`);
  return base + (base * BigInt(bps)) / BPS_DENOMINATOR;
}
