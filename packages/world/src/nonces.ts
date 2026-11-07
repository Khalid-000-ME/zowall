/**
 * Single-use request nonces, kept by the server that issued them.
 *
 * World already refuses to accept the same nonce twice, but a login must not rest on
 * the other party's checks alone. The server records each nonce it signs, and a proof
 * is only looked at if it carries one of them, once, before it expires. A proof that
 * was captured in transit, or made for some other request, has no nonce on file and
 * is turned away before World is asked anything.
 */
export type NonceStore = {
  /** Remember a nonce this server just signed. */
  issue(nonce: string): void;
  /** True once, for a nonce that was issued and has not expired. Never true again. */
  consume(nonce: string): boolean;
  size(): number;
};

export function createNonceStore(options: { ttlMs?: number; now?: () => number; max?: number } = {}): NonceStore {
  const ttl = options.ttlMs ?? 10 * 60_000;
  const now = options.now ?? Date.now;
  const max = options.max ?? 5_000;
  const issued = new Map<string, number>();

  const sweep = () => {
    const t = now();
    for (const [n, expires] of issued) if (expires <= t) issued.delete(n);
  };

  return {
    issue(nonce) {
      sweep();
      // Bounded, so an unauthenticated caller asking for nonces cannot grow memory without limit.
      if (issued.size >= max) {
        const oldest = issued.keys().next().value;
        if (oldest !== undefined) issued.delete(oldest);
      }
      issued.set(nonce, now() + ttl);
    },
    consume(nonce) {
      const expires = issued.get(nonce);
      if (expires === undefined) return false;
      issued.delete(nonce);
      return expires > now();
    },
    size: () => issued.size,
  };
}
