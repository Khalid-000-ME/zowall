import Link from "next/link";

import { ago, formatPrice } from "@/lib/amounts";
import { getAccount } from "@/lib/accounts";
import { listEndpoints } from "@/lib/registry";

export const dynamic = "force-dynamic";

export default async function RegistryHome({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const { q, tag } = await searchParams;
  const { items, total } = listEndpoints({ q, tag, limit: 60 });

  // The tags in use, so the filters are the catalogue's own vocabulary.
  const all = listEndpoints({ limit: 100 }).items;
  const tags = [...new Set(all.flatMap((e) => e.tags))].sort();

  return (
    <>
      <header>
        <p className="ui-eyebrow">Registry</p>
        <h1 className="ui-display" style={{ maxWidth: "20ch" }}>
          Paid endpoints, verified before they are listed.
        </h1>
        <p className="ui-lede">
          Every endpoint here was called by the platform and answered with a payment quote that matches what its
          merchant registered: the same payee, the same price. Spend against one under a mandate and the gate
          holds your agent to it.
        </p>
      </header>

      <form method="get" style={{ marginTop: "var(--space-6)", display: "flex", gap: 10, flexWrap: "wrap" }}>
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by name, description or URL"
          style={{
            flex: "1 1 280px",
            padding: "11px 14px",
            border: "1px solid var(--border-strong)",
            borderRadius: 9,
            background: "var(--surface)",
            color: "var(--text)",
            font: "inherit",
            fontSize: 14.5,
          }}
        />
        {tag ? <input type="hidden" name="tag" value={tag} /> : null}
        <button className="ui-btn ui-btn--primary" type="submit">
          Search
        </button>
      </form>

      {tags.length > 0 ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: "var(--space-4)" }}>
          <Link href="/registry" className={tag ? "ui-chip" : "ui-chip ui-chip--ok"} style={{ textDecoration: "none" }}>
            all
          </Link>
          {tags.map((t) => (
            <Link
              key={t}
              href={`/registry?tag=${encodeURIComponent(t)}`}
              className={tag === t ? "ui-chip ui-chip--ok" : "ui-chip"}
              style={{ textDecoration: "none" }}
            >
              {t}
            </Link>
          ))}
        </div>
      ) : null}

      <p className="ui-tile-body" style={{ margin: "var(--space-5) 0 var(--space-4)" }}>
        {total} endpoint{total === 1 ? "" : "s"}
      </p>

      {items.length === 0 ? (
        <div className="ui-panel ui-panel--sunken">
          <h2 className="ui-tile-title">Nothing listed yet</h2>
          <p className="ui-tile-body" style={{ marginTop: 6 }}>
            An endpoint appears here once it has been registered and has answered the platform&rsquo;s check.{" "}
            <Link href="/app/endpoints">Register one</Link>.
          </p>
        </div>
      ) : (
        <div className="ui-tiles" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {items.map((e) => (
            <Link key={e.id} href={`/registry/${e.id}`} className="ui-tile" style={{ textDecoration: "none", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                <h2 className="ui-tile-title" style={{ fontSize: 17 }}>
                  {e.name}
                </h2>
                <span className="ui-chip ui-chip--ok">
                  <span className="ui-dot" />
                  Verified
                </span>
              </div>
              <p className="ui-tile-body">{e.description || "No description."}</p>
              <div className="ui-mono ui-faint" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {e.url}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 }}>
                <span className="ui-stat-value" style={{ fontSize: 17 }}>
                  {formatPrice(e.asset, e.amount)}
                  <span className="ui-faint" style={{ fontSize: 12, fontFamily: "var(--font-ui)" }}>
                    {" "}
                    / call
                  </span>
                </span>
                <span className="ui-faint" style={{ fontSize: 12.5 }}>
                  {getAccount(e.merchantId)?.name} · {e.verification ? ago(e.verification.checkedAt) : ""}
                </span>
              </div>
              {e.tags.length > 0 ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {e.tags.map((t) => (
                    <span key={t} className="ui-chip">
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
