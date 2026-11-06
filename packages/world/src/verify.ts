/**
 * Server-side World ID verification, ported from `swish`, where every comment
 * below was paid for in debugging time.
 *
 * This runs in a route handler and nowhere else. The browser never receives
 * anything it could forge a verified result from - that is World's hard
 * requirement and the reason the attestation signer sits behind this call.
 */

export type WorldVerifyResult = {
  success: boolean;
  /** The RP+action-scoped pseudonym. Empty when verification failed. */
  nullifier: string;
  detail?: string;
  /**
   * World recognised the human and refused a second uniqueness proof for this
   * action. The integration is working; the question was wrong.
   */
  alreadyVerified?: boolean;
};

/**
 * The nullifier lives inside `responses[]`, not at the root. Reading it from
 * the root silently yields undefined and everything downstream looks broken
 * for the wrong reason.
 */
function nullifierFromProof(proof: unknown): string {
  const responses = (proof as { responses?: Array<{ nullifier?: string }> })?.responses ?? [];
  return responses.find((r) => r?.nullifier)?.nullifier ?? "";
}

/**
 * Verify an IDKitResult against World.
 *
 * "Forward the payload as-is" means exactly that. The IDKitResult the widget
 * returns already carries protocol_version, nonce, action, environment and the
 * responses array, and World's v4 verify endpoint wants that object at the top
 * level. Wrapping it in an envelope - which the docs' own React example does
 * when POSTing to *your* backend, not to World's - returns
 * `validation_error: responses array is required`.
 */
export async function verifyWorldProof(
  proof: unknown,
  options: { rpId?: string | undefined; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<WorldVerifyResult> {
  const rpId = options.rpId ?? process.env["WORLD_RP_ID"];
  if (!rpId) {
    return { success: false, nullifier: "", detail: "No World app configured on the server." };
  }

  const doFetch = options.fetchImpl ?? fetch;

  try {
    const res = await doFetch(`https://developer.world.org/api/v4/verify/${rpId}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(proof),
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      // Worth naming specifically. World only reaches "already used" after
      // validating the proof cryptographically, so this code is itself
      // evidence the proof was genuine - a fabricated one fails with a
      // different code and never lands here.
      if (String(data["code"] ?? "") === "nullifier_replayed") {
        return {
          success: false,
          alreadyVerified: true,
          nullifier: nullifierFromProof(proof),
          detail:
            "This World ID already verified for this action. Uniqueness proofs are " +
            "one-per-human-per-action by design - use a session proof for a repeatable check.",
        };
      }

      return {
        success: false,
        nullifier: "",
        detail: String(
          data["detail"] ?? data["message"] ?? data["code"] ?? `World returned ${res.status}`,
        ),
      };
    }

    const nullifier = nullifierFromProof(proof);
    if (!nullifier) {
      return {
        success: false,
        nullifier: "",
        detail: "World accepted the proof but it carried no nullifier.",
      };
    }

    return { success: true, nullifier };
  } catch (err) {
    return { success: false, nullifier: "", detail: String(err) };
  }
}
