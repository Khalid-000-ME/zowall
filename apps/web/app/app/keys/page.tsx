import { KeyManager } from "@/components/account/KeyManager";
import { listKeys } from "@/lib/accounts";
import { requireAccount } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Keys() {
  const account = await requireAccount();
  const keys = listKeys(account.id).map((k) => ({
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    createdAt: k.createdAt,
    lastUsedAt: k.lastUsedAt ?? null,
    revokedAt: k.revokedAt ?? null,
  }));

  return (
    <>
      <header>
        <p className="ui-eyebrow">{account.role === "vendor" ? "Selling" : "Buying"}</p>
        <h1 className="ui-display">API keys</h1>
        <p className="ui-lede">
          Send a key as <code>Authorization: Bearer &lt;key&gt;</code>, or pass it to the SDK. Keep it on your
          server. {account.role === "vendor" ? "A vendor key can register endpoints and create checkout sessions." : "A buyer key identifies your agents to the platform."}
        </p>
      </header>

      <section className="ui-section">
        <KeyManager keys={keys} />
      </section>
    </>
  );
}
