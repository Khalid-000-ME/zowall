import { NextResponse } from "next/server";
import { ROLES, assertDistinct, signAttestation, SodError, type Role } from "@zowall/world";

import { getPO } from "@/lib/chain";
import { enrollments } from "@/lib/store";
import { serverEnv } from "@/lib/env";

/**
 * Issues an EIP-712 role attestation.
 *
 * Only reachable for a personId that is already enrolled - which means a proof
 * was verified server-side by /api/world/verify first. Segregation of duties
 * is checked here so the UI can explain a refusal in words; the contract
 * enforces the same rule independently, and that is the one that counts.
 */
export async function POST(request: Request) {
  const env = serverEnv();
  if (!env.attestorKey || !env.gateAddress) {
    return NextResponse.json(
      { ok: false, detail: "attestor not configured: set ATTESTOR_PRIVATE_KEY and GATE_ADDRESS" },
      { status: 503 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { personId?: string; role?: string; poId?: string }
    | null;

  const role = body?.role as Role | undefined;
  if (!body?.personId || !role || !ROLES.includes(role)) {
    return NextResponse.json(
      { ok: false, detail: `role must be one of ${ROLES.join(", ")}` },
      { status: 400 },
    );
  }

  const enrollment = enrollments().get(body.personId as `0x${string}`);
  if (!enrollment) {
    return NextResponse.json(
      { ok: false, detail: "this person is not enrolled - verify with World ID first" },
      { status: 403 },
    );
  }

  const poId = BigInt(body.poId ?? "0");

  if (poId > 0n) {
    const po = await getPO(poId);
    if (!po) {
      return NextResponse.json({ ok: false, detail: `no purchase order ${poId}` }, { status: 404 });
    }

    try {
      const none = `0x${"00".repeat(32)}`;
      assertDistinct(enrollment.personId, {
        creator: role === "Creator" ? null : po.creatorPersonId,
        receiver:
          role === "Receiver" || po.receiverPersonId === none ? null : po.receiverPersonId,
      });
    } catch (err) {
      if (err instanceof SodError) {
        return NextResponse.json(
          { ok: false, code: "SOD_VIOLATION", detail: err.message, roles: err.heldRoles },
          { status: 409 },
        );
      }
      throw err;
    }
  }

  const attestation = await signAttestation(
    { personId: enrollment.personId, role, poId },
    {
      privateKey: env.attestorKey,
      chainId: env.chainId,
      gateAddress: env.gateAddress,
    },
  );

  // bigints do not survive JSON, and silently losing an expiry would make
  // every attestation look expired.
  return NextResponse.json({
    ok: true,
    attestation: {
      personId: attestation.personId,
      role: attestation.role,
      expiry: attestation.expiry.toString(),
      poId: attestation.poId.toString(),
      nonce: attestation.nonce.toString(),
      sig: attestation.sig,
    },
  });
}
