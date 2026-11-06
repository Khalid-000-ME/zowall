import { Walkthrough } from "@/components/Walkthrough";
import { hashscanTopic } from "@/lib/chains";
import { serverEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function WalkthroughPage() {
  const env = serverEnv();
  return (
    <Walkthrough
      topicUrl={env.hederaTopicId ? hashscanTopic(env.hederaTopicId) : null}
      gate={env.gateAddress}
    />
  );
}
