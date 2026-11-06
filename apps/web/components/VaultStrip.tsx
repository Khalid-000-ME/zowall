import { formatUsdt } from "@zowall/gate-core";

import { Hash } from "@/components/Hash";
import { addressUrl } from "@/lib/chains";
import { getVault } from "@/lib/chain";
import { serverEnv } from "@/lib/env";

/**
 * The vault, live. A purchase order reserves its total here before the vendor
 * ships, so this is the number a vendor would check: how much is actually held,
 * how much of it is already spoken for, and how much is free.
 */
export async function VaultStrip() {
  const env = serverEnv();
  if (!env.gateAddress) return null;

  let vault;
  try {
    vault = await getVault();
  } catch (err) {
    return (
      <p style={{ color: "var(--rejected)", fontSize: 14 }}>
        Could not read the vault: {err instanceof Error ? err.message : String(err)}
      </p>
    );
  }

  const cell = (label: string, value: bigint, note: string) => (
    <div style={{ minWidth: 150 }}>
      <div style={{ fontSize: 12, color: "var(--text-faint)", letterSpacing: "0.06em" }}>
        {label.toUpperCase()}
      </div>
      <div className="mono" style={{ fontSize: 26, lineHeight: 1.2 }}>
        {formatUsdt(value)}
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}> USDT</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{note}</div>
    </div>
  );

  return (
    <section
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        background: "var(--surface)",
        padding: "var(--space-4) var(--space-5)",
        display: "flex",
        gap: "var(--space-6)",
        flexWrap: "wrap",
        alignItems: "flex-end",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", gap: "var(--space-6)", flexWrap: "wrap" }}>
        {cell("In the vault", vault.balance, "held by the gate contract")}
        {cell("Reserved", vault.encumbered, "against open purchase orders")}
        {cell("Free", vault.free, "available to new orders")}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "right" }}>
        <div>Whitechain Sepolia · USDT, 6 decimals</div>
        <Hash value={env.gateAddress} href={addressUrl(env.chainId, env.gateAddress)} />
      </div>
    </section>
  );
}
