import { NextResponse } from "next/server";
import { keccak256, toHex } from "viem";
import { parseUsdt } from "@zowall/gate-core";

import { enrollments, purchaseOrders } from "@/lib/store";
import { serverEnv } from "@/lib/env";

/**
 * Raise a purchase order.
 *
 * Without a deployed gate and a funded buyer key this records the order
 * locally and says so, rather than reporting a reservation that does not
 * exist. An encumbrance nobody can verify is worth nothing.
 */
export async function POST(request: Request) {
  const env = serverEnv();
  const body = (await request.json().catch(() => null)) as Record<string, string> | null;

  if (!body?.vendor || !body.payee || !body.qty || !body.unitPrice) {
    return NextResponse.json(
      { ok: false, detail: "vendor, payee, qty and unitPrice are required" },
      { status: 400 },
    );
  }

  const creator = enrollments.all()[0];
  if (!creator) {
    return NextResponse.json(
      {
        ok: false,
        detail:
          "no enrolled human to raise this. Verify with World ID first - a purchase order " +
          "with no named creator cannot support segregation of duties.",
      },
      { status: 403 },
    );
  }

  let qty: bigint;
  let unitPrice: bigint;
  try {
    qty = BigInt(body.qty);
    unitPrice = parseUsdt(body.unitPrice);
  } catch (err) {
    return NextResponse.json({ ok: false, detail: String(err) }, { status: 400 });
  }

  const priceTolBps = Math.round(Number(body.priceTolPct ?? "0") * 100);
  const days = Number(body.days ?? "30");
  const description = (body.description ?? "").slice(0, 120);

  const id = BigInt(purchaseOrders.all().length + 1);

  purchaseOrders.put({
    id,
    vendor: body.vendor as `0x${string}`,
    payee: body.payee as `0x${string}`,
    description,
    specHash: keccak256(toHex(description)),
    qty,
    unitPrice,
    priceTolBps,
    qtyTolBps: 0,
    expiry: BigInt(Math.floor(Date.now() / 1000) + days * 86_400),
    received: 0n,
    invoicedQty: 0n,
    invoicedValue: 0n,
    creatorPersonId: creator.personId,
    receiverPersonId: null,
    status: "Open",
    vendorToken: crypto.randomUUID(),
  });

  return NextResponse.json({
    ok: true,
    poId: id.toString(),
    // Say plainly which half happened.
    onChain: Boolean(env.gateAddress),
    detail: env.gateAddress
      ? "recorded; submit on-chain from the dashboard"
      : "recorded locally only - GATE_ADDRESS is not set, so nothing is reserved on-chain yet",
  });
}
