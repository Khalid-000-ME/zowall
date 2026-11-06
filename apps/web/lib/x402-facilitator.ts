/**
 * Talking to an x402 facilitator.
 *
 * The facilitator is the service that checks a payment and puts it on the
 * network, paying the fee. This module only ever asks it three things: who its
 * fee payer is (`/supported`), whether a payment is valid (`/verify`), and to
 * settle it (`/settle`). It holds no keys.
 */

export const FACILITATOR_URL = (process.env.FACILITATOR_URL ?? "https://x402.org/facilitator").replace(/\/$/, "");
export const NETWORK = "hedera:testnet";

let memo: { at: number; feePayer: string } | null = null;

/**
 * The fee payer the facilitator will sign as. It is part of every quote, because
 * the client has to build the transaction with that account as its payer.
 */
export async function feePayer(): Promise<string> {
  if (memo && Date.now() - memo.at < 300_000) return memo.feePayer;

  const res = await fetch(`${FACILITATOR_URL}/supported`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`facilitator /supported answered ${res.status}`);

  const j = (await res.json()) as { kinds?: Array<{ network: string; scheme: string; extra?: { feePayer?: string } }> };
  const kind = j.kinds?.find((k) => k.network === NETWORK && k.scheme === "exact");
  if (!kind?.extra?.feePayer) throw new Error(`facilitator does not advertise ${NETWORK}`);

  memo = { at: Date.now(), feePayer: kind.extra.feePayer };
  return memo.feePayer;
}

export type Verification = { isValid: boolean; invalidReason?: string; invalidMessage?: string; payer?: string };
export type Settlement = { success: boolean; transaction?: string; network?: string; payer?: string; errorReason?: string };

async function post<T>(path: "verify" | "settle", body: unknown): Promise<T> {
  const res = await fetch(`${FACILITATOR_URL}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });
  return (await res.json()) as T;
}

type Envelope = { paymentPayload: unknown; paymentRequirements: unknown };

export const verify = (e: Envelope) => post<Verification>("verify", { x402Version: 2, ...e });
export const settle = (e: Envelope) => post<Settlement>("settle", { x402Version: 2, ...e });
