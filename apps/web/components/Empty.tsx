/** An empty state says what is missing and what to do. Nothing else. */
export function Empty({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px dashed var(--border-strong)",
        borderRadius: "var(--radius)",
        padding: "var(--space-7) var(--space-5)",
        textAlign: "center",
        color: "var(--text-muted)",
      }}
    >
      <p style={{ margin: 0 }}>{title}</p>
      {action ? <div style={{ marginTop: "var(--space-4)" }}>{action}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  children,
  tone,
}: {
  title: string;
  children: React.ReactNode;
  tone?: "default" | "sunken";
}) {
  return (
    <section
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        background: tone === "sunken" ? "var(--surface-sunken)" : "var(--surface)",
        padding: "var(--space-4)",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 12,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--text-faint)",
          marginBottom: "var(--space-3)",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * A field in the three-pane view. `disagrees` is the whole point: a judge two
 * metres away has to see which number is wrong without reading the labels.
 */
export function Field({
  label,
  value,
  disagrees,
}: {
  label: string;
  value: React.ReactNode;
  disagrees?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "var(--space-3)",
        padding: "6px 8px",
        marginInline: -8,
        borderRadius: "var(--radius-sm)",
        background: disagrees ? "var(--rejected-bg)" : "transparent",
        color: disagrees ? "var(--rejected)" : "inherit",
        fontWeight: disagrees ? 600 : 400,
      }}
    >
      <span style={{ color: disagrees ? "inherit" : "var(--text-muted)", fontSize: 13 }}>
        {label}
      </span>
      <span className="mono">{value}</span>
    </div>
  );
}
