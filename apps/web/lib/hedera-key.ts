/**
 * Reading an account's key structure off the public ledger.
 *
 * The mirror node reports a threshold or list key only as protobuf bytes. This
 * decodes just enough of Hedera's `Key` message to draw the tree, with no SDK
 * and no credentials, so the proofs page can show what the network itself will
 * enforce without taking our word for it.
 *
 *   Key         { contract=1, ed25519=2, rsa=3, ecdsa384=4, threshold=5, list=6, ecdsa=7 }
 *   Threshold   { threshold=1 (varint), keys=2 (KeyList) }
 *   KeyList     { keys=1 (repeated Key) }
 */

export type KeyNode =
  | { kind: "threshold"; threshold: number; children: KeyNode[] }
  | { kind: "all"; children: KeyNode[] }
  | { kind: "key"; type: "ECDSA" | "ED25519" | "other"; hex: string };

type Field = { field: number; wire: number; value: Uint8Array | number };

function* fields(buf: Uint8Array): Generator<Field> {
  let i = 0;
  const varint = (): number => {
    let result = 0;
    let shift = 0;
    for (;;) {
      const b = buf[i++];
      if (b === undefined) throw new Error("truncated protobuf");
      result += (b & 0x7f) * 2 ** shift;
      if ((b & 0x80) === 0) return result;
      shift += 7;
    }
  };
  while (i < buf.length) {
    const tag = varint();
    const field = Math.floor(tag / 8);
    const wire = tag % 8;
    if (wire === 0) yield { field, wire, value: varint() };
    else if (wire === 2) {
      const len = varint();
      yield { field, wire, value: buf.subarray(i, i + len) };
      i += len;
    } else throw new Error(`unsupported wire type ${wire}`);
  }
}

const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

function decodeList(buf: Uint8Array): KeyNode[] {
  const out: KeyNode[] = [];
  for (const f of fields(buf)) if (f.field === 1 && typeof f.value !== "number") out.push(decodeKey(f.value));
  return out;
}

export function decodeKey(buf: Uint8Array): KeyNode {
  for (const f of fields(buf)) {
    if (typeof f.value === "number") continue;
    if (f.field === 5) {
      let threshold = 0;
      let children: KeyNode[] = [];
      for (const t of fields(f.value)) {
        if (t.field === 1 && typeof t.value === "number") threshold = t.value;
        if (t.field === 2 && typeof t.value !== "number") children = decodeList(t.value);
      }
      return { kind: "threshold", threshold, children };
    }
    if (f.field === 6) return { kind: "all", children: decodeList(f.value) };
    if (f.field === 7) return { kind: "key", type: "ECDSA", hex: toHex(f.value) };
    if (f.field === 2) return { kind: "key", type: "ED25519", hex: toHex(f.value) };
  }
  return { kind: "key", type: "other", hex: "" };
}

/** The payer's key tree, from the mirror node. Null if it cannot be read. */
export async function accountKeyTree(accountId: string): Promise<KeyNode | null> {
  try {
    const res = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/accounts/${accountId}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { key?: { _type?: string; key?: string } };
    if (!j.key?.key) return null;
    if (j.key._type !== "ProtobufEncoded") {
      return { kind: "key", type: j.key._type?.startsWith("ED") ? "ED25519" : "ECDSA", hex: j.key.key };
    }
    return decodeKey(Uint8Array.from(Buffer.from(j.key.key, "hex")));
  } catch {
    return null;
  }
}

/** One line a person can read: "2 of [ agent key, 2 of [ 3 guardian keys ] ]". */
export function describe(node: KeyNode): string {
  if (node.kind === "key") return `${node.type} key`;
  const inner = node.children.map(describe).join(", ");
  return node.kind === "threshold" ? `${node.threshold} of [ ${inner} ]` : `all of [ ${inner} ]`;
}
