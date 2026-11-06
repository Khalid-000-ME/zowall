import { NextResponse } from "next/server";

import { PAYMENT_HEADER, PAYMENT_RESPONSE_HEADER } from "@zowall/x402";

export const dynamic = "force-dynamic";

/**
 * A stand-in for somebody else's paid API.
 *
 * The middleware has to be shown refusing a payment to a server it does not
 * control, and pointing the demo at a real third-party endpoint would mean
 * either settling real money on every click or faking the settlement anyway.
 * So this is an honest local stand-in: it speaks the protocol correctly - a
 * 402 with a proper `accepts` array, a 200 once `X-PAYMENT` is present, and a
 * base64 `X-PAYMENT-RESPONSE` on the way back - and it lies about nothing
 * except being a stranger.
 *
 * The query parameters are how the attacks are staged. A compromised or greedy
 * endpoint is exactly one that quotes a different `payTo` or a higher price
 * than the one a human agreed to, so those are parameters rather than separate
 * routes.
 */
const DEFAULT_PRICE = "10000"; // 0.01 USDC, 6 decimals
const DEFAULT_PAY_TO = "0x2222222222222222222222222222222222222222";

function quoteFor(url: URL) {
  const resource = `${url.origin}${url.pathname}`;
  return {
    scheme: "exact",
    network: process.env.X402_NETWORK ?? "hedera-testnet",
    maxAmountRequired: url.searchParams.get("price") ?? DEFAULT_PRICE,
    asset: process.env.X402_ASSET ?? "0.0.429274",
    payTo: url.searchParams.get("payTo") ?? process.env.X402_PAY_TO ?? DEFAULT_PAY_TO,
    resource,
    description: "One forecast for the next hour",
    mimeType: "application/json",
    maxTimeoutSeconds: 60,
  };
}

async function handle(request: Request) {
  const url = new URL(request.url);
  const payment = request.headers.get(PAYMENT_HEADER);

  if (!payment) {
    return NextResponse.json(
      { x402Version: 1, error: "X-PAYMENT header is required", accepts: [quoteFor(url)] },
      { status: 402 },
    );
  }

  // A real resource server verifies and settles through a facilitator here.
  // This one reports a settlement it did not perform, and says so: the
  // transaction id below is marked as simulated so nothing downstream can
  // mistake it for an on-chain payment.
  const settlement = {
    success: true,
    transaction: "simulated",
    network: process.env.X402_NETWORK ?? "hedera-testnet",
    payer: "demo-agent",
  };

  return NextResponse.json(
    {
      forecast: "clear, 24C",
      note: "This endpoint stands in for a third-party x402 API. No money moved.",
    },
    {
      status: 200,
      headers: {
        [PAYMENT_RESPONSE_HEADER]: Buffer.from(JSON.stringify(settlement)).toString("base64"),
      },
    },
  );
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
