/**
 * Role attestations: EIP-712 signatures that say "this person, in this role, is
 * doing exactly this".
 *
 * Two properties carry the weight, and both are enforced by the contract, not by
 * this file:
 *
 *  1. The attestation commits to the ACTION. The terms of the purchase order,
 *     the quantity received, the hold and the verdict are hashed into it, and the
 *     contract recomputes that hash from the call's own arguments. An
 *     attestation copied out of the mempool therefore only ever authorises the
 *     exact thing its person signed for.
 *
 *  2. It needs a QUORUM. The gate holds a set of attestor addresses and a
 *     threshold. Each attestor is an independent service that verifies the
 *     World ID proof itself and signs; the contract accepts an attestation only
 *     when at least `threshold` of them have, in strictly ascending address
 *     order. One stolen key cannot mint a person.
 *
 * The browser never holds a key, so nothing it sends can produce a valid
 * attestation.
 */

import {
  concat,
  encodeAbiParameters,
  keccak256,
  toBytes,
  type Hex,
} from "viem";

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
  /** the hash of the action this attestation authorises */
  actionHash: Bytes32;
  /** makes two otherwise identical attestations distinct */
  nonce: bigint;
  /** the attestors' 65-byte signatures, concatenated, ordered by signer address */
  sig: Hex;
};

export const ATTESTATION_TYPES = {
  Attestation: [
    { name: "personId", type: "bytes32" },
    { name: "role", type: "uint8" },
    { name: "expiry", type: "uint64" },
    { name: "poId", type: "uint256" },
    { name: "actionHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

/* ---------------------------------------------------------- action hashes -- */

/**
 * These mirror `createActionHash`, `cancelActionHash`, `receiptActionHash` and
 * `holdActionHash` in ZowallGate.sol. They are pinned against the contract by a
 * shared test vector: the same inputs hash to the same constant in Foundry and
 * here, so a drift in either language fails a test instead of failing a user.
 */
export type POTerms = {
  vendor: `0x${string}`;
  payee: `0x${string}`;
  specHash: Bytes32;
  qty: bigint;
  unitPrice: bigint;
  priceTolBps: number;
  qtyTolBps: number;
  expiry: bigint;
};

const tag = (name: string): Hex => keccak256(toBytes(name));

export function createActionHash(po: POTerms): Bytes32 {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "bytes32" },
        { type: "uint128" },
        { type: "uint128" },
        { type: "uint16" },
        { type: "uint16" },
        { type: "uint64" },
      ],
      [tag("CreatePO"), po.vendor, po.payee, po.specHash, po.qty, po.unitPrice, po.priceTolBps, po.qtyTolBps, po.expiry],
    ),
  );
}

export function cancelActionHash(poId: bigint): Bytes32 {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [tag("CancelPO"), poId]));
}

export function receiptActionHash(poId: bigint, qty: bigint, deliverableHash: Bytes32): Bytes32 {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "uint128" }, { type: "bytes32" }],
      [tag("AttestReceipt"), poId, qty, deliverableHash],
    ),
  );
}

export function holdActionHash(holdId: bigint, approve: boolean): Bytes32 {
  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "uint256" }, { type: "bool" }],
      [tag("ResolveHold"), holdId, approve],
    ),
  );
}

/* ---------------------------------------------------------------- signing -- */

export type AttestorConfig = {
  /**
   * The attestors' 0x-prefixed private keys. In production each lives in a
   * separate service; here one process may hold several, which is a statement
   * about the demo and not about the contract.
   */
  privateKeys: readonly `0x${string}`[];
  /** how many of them sign each attestation. Must equal the gate's threshold. */
  threshold: number;
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
 * Sign a role attestation with a quorum of attestors. Call this only on a path
 * where a World proof has already been verified server-side; it deliberately
 * takes a personId rather than a proof, so the verification step cannot be
 * skipped by accident at this layer without it being visible at the call site.
 */
export async function signAttestation(
  input: { personId: Bytes32; role: Role; poId: bigint; actionHash: Bytes32 },
  config: AttestorConfig,
): Promise<Attestation> {
  const { privateKeyToAccount } = await import("viem/accounts");

  if (config.threshold < 1 || config.threshold > config.privateKeys.length) {
    throw new Error(
      `threshold ${config.threshold} cannot be met by ${config.privateKeys.length} attestor keys`,
    );
  }

  const expiry = BigInt(Math.floor(Date.now() / 1000) + (config.ttlSeconds ?? 600));
  const nonce = BigInt(`0x${crypto.randomUUID().replaceAll("-", "")}`);

  const message = {
    personId: input.personId,
    role: ROLE_CODE[input.role],
    expiry,
    poId: input.poId,
    actionHash: input.actionHash,
    nonce,
  };

  // Exactly `threshold` signatures, from the attestors whose addresses sort
  // lowest, then ordered by address: the contract requires ascending order so
  // that the same key twice cannot be counted as two attestors.
  const accounts = config.privateKeys
    .map((k) => privateKeyToAccount(k))
    .sort((a, b) => (BigInt(a.address) < BigInt(b.address) ? -1 : 1))
    .slice(0, config.threshold);

  const sigs: Hex[] = [];
  for (const account of accounts) {
    sigs.push(
      await account.signTypedData({
        domain: domain(config),
        types: ATTESTATION_TYPES,
        primaryType: "Attestation",
        message,
      }),
    );
  }

  return { ...message, sig: concat(sigs) };
}

/** The attestors' public addresses, for the constructor argument and the README. */
export async function attestorAddresses(privateKeys: readonly `0x${string}`[]): Promise<`0x${string}`[]> {
  const { privateKeyToAccount } = await import("viem/accounts");
  return privateKeys.map((k) => privateKeyToAccount(k).address);
}
