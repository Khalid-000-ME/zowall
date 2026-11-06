import { NextResponse } from "next/server";

import { getAccount } from "@/lib/accounts";
import { RegistryError, type Endpoint } from "@/lib/registry";

/** An endpoint as the outside world sees it: with the merchant's name, never its key. */
export function publicEndpoint(e: Endpoint) {
  const m = getAccount(e.merchantId);
  return {
    id: e.id,
    name: e.name,
    description: e.description,
    url: e.url,
    network: e.network,
    asset: e.asset,
    payTo: e.payTo,
    amount: e.amount,
    tags: e.tags,
    visibility: e.visibility,
    status: e.status,
    specHash: e.specHash,
    merchant: m ? { id: m.id, name: m.name } : { id: e.merchantId, name: "" },
    verification: e.verification
      ? {
          ok: e.verification.ok,
          reasons: e.verification.reasons,
          checkedAt: e.verification.checkedAt,
          x402Version: e.verification.quote?.version ?? null,
          feePayer: e.verification.quote?.feePayer ?? null,
        }
      : null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export function fail(err: unknown) {
  if (err instanceof RegistryError) return NextResponse.json({ error: err.message }, { status: err.status });
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
}
