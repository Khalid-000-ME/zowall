/**
 * Role attestations, ported from swish's ed25519 + `sui::ed25519_verify`
 * pattern to EIP-712 + `ecrecover`.
 *
 * The shape is unchanged and it is the important part: the backend signs a
 * canonical message only *after* a World proof verifies, and the chain
 * re-derives that message and checks the signature. Nothing the browser sends
 * can produce a valid attestation, because the browser never holds the key.
 *
 * If the contract's reconstruction and this signer ever disagree, the gate
 * reverts with BadAttestation. That mismatch is the mechanism working, not a
 * bug to paper over.
 */

import type { Bytes32 } from "@zowall/gate-core";
import { ROLE_CODE, type Role } from "./roles.ts";

export type Attestation = {
  personId: Bytes32;
  /** numeric role, matching ZowallGate.Role */
  role: number;
  /** unix seconds */
  expiry: bigint;
  /** 0 for a PO-independent act such as createPO */
  poId: bigint;
  /** makes two otherwise identical attestations distinct */
  nonce: bigint;
  sig: `0x${string}`;
};

export const ATTESTATION_TYPES = {
  Attestation: [
    { name: "personId", type: "bytes32" },
    { name: "role", type: "uint8" },
    { name: "expiry", type: "uint64" },
    { name: "poId", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export type AttestorConfig = {
  /** 0x-prefixed private key of the backend attestor. Server only. */
  privateKey: `0x${string}`;
  chainId: number;
  gateAddress: `0x${string}`;
  ttlSeconds?: number;
};

export function domain(config: Pick<AttestorConfig, "chainId" | "gateAddress">) {
  return {
    name: "Zowall",
    version: "1",
    chainId: config.chainId,
    verifyingContract: config.gateAddress,
  } as const;
}

/**
 * Sign a role attestation. Call this only on a path where a World proof has
 * already been verified server-side; it deliberately takes a personId rather
 * than a proof, so the verification step cannot be skipped by accident at this
 * layer without it being visible at the call site.
 */
export async function signAttestation(
  input: { personId: Bytes32; role: Role; poId: bigint },
  config: AttestorConfig,
): Promise<Attestation> {
  const { privateKeyToAccount } = await import("viem/accounts");
  const account = privateKeyToAccount(config.privateKey);

  const expiry = BigInt(Math.floor(Date.now() / 1000) + (config.ttlSeconds ?? 600));
  const nonce = BigInt(`0x${crypto.randomUUID().replaceAll("-", "")}`);

  const message = {
    personId: input.personId,
    role: ROLE_CODE[input.role],
    expiry,
    poId: input.poId,
    nonce,
  };

  const sig = await account.signTypedData({
    domain: domain(config),
    types: ATTESTATION_TYPES,
    primaryType: "Attestation",
    message,
  });

  return { ...message, sig };
}

/** The attestor's public address, for the constructor argument and the README. */
export async function attestorAddress(privateKey: `0x${string}`): Promise<`0x${string}`> {
  const { privateKeyToAccount } = await import("viem/accounts");
  return privateKeyToAccount(privateKey).address;
}
