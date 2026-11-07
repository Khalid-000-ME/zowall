import { EnrollPanel } from "@/components/EnrollPanel";

export const dynamic = "force-dynamic";

export default function People() {
  return (
    <>
      <header>
        <p className="ui-eyebrow">Identity</p>
        <h1 className="ui-display">People</h1>
        <p className="ui-lede">
          Every order has a creator, a receiver and an approver, and the contract refuses to let one
          person hold two of those roles. Each person verifies once with World ID, and that is what makes
          &ldquo;three different people&rdquo; mean something.
        </p>
      </header>

      <section className="ui-section">
        <EnrollPanel />
      </section>
    </>
  );
}
