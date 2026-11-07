import { NextResponse } from "next/server";

import { authNonces, loginAction } from "@/lib/world-auth";

/**
 * The config the IDKit widget needs to open a real World ID request,
 * including the `rp_context`, which is signed here because it has to be:
 * World ID enforces RP signatures for 4.0 requests and the signing key can
 * never reach a browser.
 *
 * Ported from `swish`, an earlier project, where the comments below were paid
 * for in debugging time.
 */
export async function GET(request: Request) {
  // A signature carries a single-use nonce, so signing is opt-in: the UI
  // probes for configuration on mount without burning one, and asks for a
  // fresh signature only when the widget is about to open. Reusing one is what
  // World rejects as `duplicate_nonce`.
  const params = new URL(request.url).searchParams;
  const sign = params.get("sign") === "1";
  // kind=auth is a sign-in request: its own action, and its nonce is kept so the proof
  // can be matched to it when it comes back.
  const auth = params.get("kind") === "auth";

  const appId = process.env.WORLD_APP_ID;
  const rpId = process.env.WORLD_RP_ID;
  const authAction = loginAction();
  const action = auth ? authAction.action : process.env.WORLD_ACTION;
  // The Portal calls it signing_key.private_key; both spellings show up in
  // people's .env files.
  const signingKeyHex = process.env.WORLD_RP_SIGNING_KEY ?? process.env.WORLD_RP_PRIVATE_KEY;
  const requested = process.env.WORLD_ENVIRONMENT;
  const environment =
    requested === "staging" || requested === "sandbox" ? requested : "production";

  const missing = [
    !appId && "WORLD_APP_ID",
    !rpId && "WORLD_RP_ID",
    !action && (auth ? "WORLD_LOGIN_ACTION or WORLD_ACTION" : "WORLD_ACTION"),
    !signingKeyHex && "WORLD_RP_SIGNING_KEY",
  ].filter((v): v is string => typeof v === "string");

  if (missing.length > 0) {
    // Say so plainly rather than showing a button that claims to verify and
    // does not.
    return NextResponse.json({ configured: false, missing });
  }

  if (!sign) {
    return NextResponse.json({
      configured: true,
      app_id: appId,
      action,
      environment,
      ...(auth ? { repeatable: authAction.repeatable } : {}),
    });
  }

  try {
    const { signRequest } = await import("@worldcoin/idkit-core/signing");

    // signRequest produces the exact message layout World expects:
    // version || nonce || created_at || expires_at, plus a hashed action for a
    // uniqueness proof. Hand-rolling it with a generic ECDSA sign does not
    // work - it is a specific 49/81-byte preimage, not a free-form string.
    const sig = signRequest({ signingKeyHex: signingKeyHex!, action: action! });

    if (auth) authNonces.issue(sig.nonce);

    return NextResponse.json({
      configured: true,
      app_id: appId,
      action,
      environment,
      ...(auth ? { repeatable: authAction.repeatable } : {}),
      rp_context: {
        rp_id: rpId,
        nonce: sig.nonce,
        created_at: sig.createdAt,
        expires_at: sig.expiresAt,
        signature: sig.sig,
      },
    });
  } catch (err) {
    console.error("[zowall] failed to sign World rp_context", err);
    return NextResponse.json({
      configured: false,
      missing: ["WORLD_RP_SIGNING_KEY (rejected by signRequest - check it is the raw hex key)"],
    });
  }
}
