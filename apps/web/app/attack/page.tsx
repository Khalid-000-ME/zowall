import { SAMPLE_ATTACKS } from "@zowall/agent";

import { AttackConsole } from "@/components/AttackConsole";
import { hashscanTopic } from "@/lib/chains";
import { serverEnv } from "@/lib/env";

/**
 * Where anyone can try to break it.
 *
 * The agent behind this box is deliberately gullible - no allowlist, no cap,
 * no injection detection - and saying so out loud is what disarms "you tuned
 * it to fail". Prevention belongs at the payment rail, not in the model's
 * reading comprehension.
 */
export default function AttackPage() {
  const topic = serverEnv().hederaTopicId;
  return (
    <div className="page" style={{ paddingBlock: "var(--space-6)" }}>
      <h1 style={{ fontSize: 30, marginBottom: "var(--space-2)" }}>Attack console</h1>
      <p style={{ color: "var(--text-muted)", maxWidth: "var(--measure)", marginTop: 0 }}>
        Type anything you would send a finance team. The agent will believe you. It has no
        allowlist, no spending cap and no sense of suspicion, on purpose.
      </p>
      <AttackConsole samples={[...SAMPLE_ATTACKS]} topicUrl={topic ? hashscanTopic(topic) : null} />
    </div>
  );
}
