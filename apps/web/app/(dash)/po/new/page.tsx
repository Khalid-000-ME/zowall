import { NewPOForm } from "@/components/NewPOForm";

export default function NewPOPage() {
  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ fontSize: 30, marginBottom: "var(--space-2)" }}>Raise a purchase order</h1>
      <p style={{ color: "var(--text-muted)", marginTop: 0 }}>
        The total, plus the price tolerance, is reserved in the vault as soon as this is raised, so
        the vendor can see the money is set aside before they ship.
      </p>
      <NewPOForm />
    </div>
  );
}
