import { NextResponse } from "next/server";

import {
  PAYMENT_REQUIRED_HEADER,
  PAYMENT_RESPONSE_HEADER,
  PAYMENT_SIGNATURE_HEADER,
  decodeHeader,
  encodeHeader,
} from "@zowall/x402";

import { NETWORK, feePayer, settle, verify } from "@/lib/x402-facilitator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A paid API, speaking x402 v2 on Hedera.
 *
 * It is a real resource server: it quotes a price in a `PAYMENT-REQUIRED`
 * header, takes the payment from `PAYMENT-SIGNATURE`, has a facilitator verify
 * and then settle it on Hedera testnet, and only then answers. The money that
 * moves is real testnet HBAR and the transaction id it returns is a real
 * transaction on HashScan.
 *
 * What makes it stand in for "somebody else's API" is only that we run it, so
 * that the middleware can be shown refusing a server it does not control. The
 * query parameters are how the misbehaving server is staged: a compromised or
 * greedy endpoint is exactly one that quotes a different `payTo` or a higher
 * price than the one a person agreed to.
 */
const DEFAULT_PRICE = "10000";

async function requirements(url: URL) {
  return {
    scheme: "exact",
    network: NETWORK,
    amount: url.searchParams.get("price") ?? DEFAULT_PRICE,
    asset: "0.0.0",
    payTo: url.searchParams.get("payTo") ?? process.env.X402_PAY_TO ?? "",
    maxTimeoutSeconds: 60,
    extra: { feePayer: await feePayer() },
  };
}

async function handle(request: Request) {
  const url = new URL(request.url);
  const resource = {
    url: `${url.origin}${url.pathname}`,
    description: "One forecast for the next hour",
    mimeType: "application/json",
  };

  let accepted: Awaited<ReturnType<typeof requirements>>;
  try {
    accepted = await requirements(url);
  } catch (err) {
    return NextResponse.json({ error: `facilitator unavailable: ${String(err)}` }, { status: 503 });
  }

  const header = request.headers.get(PAYMENT_SIGNATURE_HEADER);

  if (!header) {
    const required = {
      x402Version: 2,
      error: `${PAYMENT_SIGNATURE_HEADER} header is required`,
      resource,
      accepts: [accepted],
    };
    return new NextResponse(JSON.stringify(required), {
      status: 402,
      headers: {
        "content-type": "application/json",
        [PAYMENT_REQUIRED_HEADER]: encodeHeader(required),
      },
    });
  }

  const payload = decodeHeader<{ payload?: unknown }>(header);
  if (!payload) {
    return NextResponse.json({ error: "the payment header is not valid base64 JSON" }, { status: 400 });
  }

  // The requirements are rebuilt here from the request, never taken from what
  // the client sent back, so a client cannot change what it is being asked to pay.
  const envelope = { paymentPayload: payload, paymentRequirements: accepted };

  const checked = await verify(envelope);
  if (!checked.isValid) {
    return NextResponse.json(
      { error: "payment not accepted", reason: checked.invalidReason, detail: checked.invalidMessage },
      { status: 402 },
    );
  }

  const settled = await settle(envelope);
  if (!settled.success) {
    return NextResponse.json({ error: "settlement failed", reason: settled.errorReason }, { status: 402 });
  }

  return NextResponse.json(
    { forecast: "clear, 24C" },
    {
      status: 200,
      headers: {
        [PAYMENT_RESPONSE_HEADER]: encodeHeader({
          success: true,
          transaction: settled.transaction,
          network: settled.network ?? NETWORK,
          payer: settled.payer,
        }),
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
