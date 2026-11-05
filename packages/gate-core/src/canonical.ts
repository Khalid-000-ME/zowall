/**
 * The digest that binds the two chains.
 *
 * The EVM `Decision` event carries this digest. The Hedera journal entry
 * carries the same digest plus the EVM tx hash. `journal replay` recomputes it
 * from the EVM log and asserts the two agree, so a stranger can check that the
 * refusals on Hedera are the refusals that happened on Whitechain.
 *
 * Encoding is `abi.encode` of fourteen static 32-byte words, so Solidity
 * reproduces it with one `abi.encode` call and this file needs no ABI coder.
 * keccak256 is INJECTED rather than imported, which is what keeps this package
 * dependency-free - the caller passes viem's keccak256, or the contract's
 * native one.
 *
 * Note: personIds are three fixed slots rather than a dynamic array. A dynamic
 * array changes abi.encode's layout and would need an offset and length word,
 * which is exactly the kind of thing that silently differs between two
 * implementations.
 */

import { outcomeCode } from "./evaluate.ts";
import type { Address, Bytes32, Hex } from "./types.ts";
import { ZERO_PERSON } from "./types.ts";
import type { Outcome } from "./codes.ts";

export type DigestInput = {
  chainId: bigint;
  gate: Address;
  poId: bigint;
  invoiceHash: Bytes32;
  outcome: Outcome;
  reasonMask: number;
  invQty: bigint;
  recvQty: bigint;
  invUnitPrice: bigint;
  poUnitPrice: bigint;
  creatorPersonId: Bytes32;
  receiverPersonId: Bytes32 | null;
  approverPersonId: Bytes32 | null;
  nonce: bigint;
};

const WORD = 32;
const MAX_UINT256 = (1n << 256n) - 1n;

function word(value: bigint): string {
  if (value < 0n || value > MAX_UINT256) throw new Error(`out of uint256 range: ${value}`);
  return value.toString(16).padStart(WORD * 2, "0");
}

function wordFromHex(hex: string): string {
  const raw = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]*$/.test(raw)) throw new Error(`not hex: ${hex}`);
  if (raw.length > WORD * 2) throw new Error(`wider than 32 bytes: ${hex}`);
  return raw.toLowerCase().padStart(WORD * 2, "0");
}

/** The exact bytes `abi.encode(...)` would produce, as a 0x-prefixed string. */
export function encodeDecision(input: DigestInput): Hex {
  const words = [
    word(input.chainId),
    wordFromHex(input.gate),
    word(input.poId),
    wordFromHex(input.invoiceHash),
    word(BigInt(outcomeCode(input.outcome))),
    word(BigInt(input.reasonMask >>> 0)),
    word(input.invQty),
    word(input.recvQty),
    word(input.invUnitPrice),
    word(input.poUnitPrice),
    wordFromHex(input.creatorPersonId),
    wordFromHex(input.receiverPersonId ?? ZERO_PERSON),
    wordFromHex(input.approverPersonId ?? ZERO_PERSON),
    word(input.nonce),
  ];
  return `0x${words.join("")}`;
}

export type Keccak256 = (data: Hex) => Hex;

export function journalDigest(input: DigestInput, keccak256: Keccak256): Hex {
  return keccak256(encodeDecision(input));
}
