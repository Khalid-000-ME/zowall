import { EnrollPanel } from "@/components/EnrollPanel";

export default function EnrollPage() {
  return (
    <>
      <h1 style={{ fontSize: 34, marginBottom: "var(--space-2)" }}>Verify people</h1>
      <p style={{ color: "var(--text-muted)", maxWidth: "var(--measure)", marginTop: 0 }}>
        Every purchase order has a creator, a receiver and an approver, and the contract refuses to
        let one person hold two of those roles. That only means something if each role is a real,
        distinct person, which is what a World ID proof establishes.
      </p>
      <EnrollPanel />
    </>
  );
}
