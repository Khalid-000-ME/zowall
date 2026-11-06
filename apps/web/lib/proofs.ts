/**
 * Everything the proofs page shows, read from somewhere a stranger can also
 * read it: the Hedera mirror node, the Whitechain gate, the enrolment
 * registry. Nothing here is a typed-in claim.
 *
 * Each reader fails soft. A proofs page that errors out when one node is
 * having a bad minute is worse than useless in front of a judge, so a failed
 * read comes back as `null` and the page says it could not confirm that item.
 */

import { getDecisions, getPOs, type ChainDecision, type ChainPO } from "@/lib/chain";
import { serverEnv } from "@/lib/env";
import { humans, nameOf, type Human } from "@/lib/humans";
import { getJournal } from "@/lib/journal-read";
import { findMandate } from "@/lib/x402-demo";

const MIRROR = "https://testnet.mirrornode.hedera.com";

export type TopicProof = {
  topicId: string;
  /** null when the topic was created without an admin key: it cannot be changed or deleted */
  adminKey: unknown;
  submitKeySet: boolean;
  memo: string;
};

/** Ask the public mirror node, not our own record of what we created. */
export async function topicProof(topicId: string): Promise<TopicProof | null> {
  try {
    const res = await fetch(`${MIRROR}/api/v1/topics/${topicId}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      admin_key?: unknown;
      submit_key?: unknown;
      memo?: string;
    };
    return {
      topicId,
      adminKey: j.admin_key ?? null,
      submitKeySet: j.submit_key != null,
      memo: j.memo ?? "",
    };
  } catch {
    return null;
  }
}

export type WorldProof = {
  environment: string;
  action: string;
  appId: string | null;
  enrolled: Human[];
  /** most recent decision whose creator, receiver and approver are all different, filled people */
  threeParty: {
    decision: ChainDecision;
    names: { creator: string; receiver: string; approver: string };
    allEnrolled: boolean;
  } | null;
};

const ZERO = /^0x0+$/;

export async function worldProof(decisions: ChainDecision[]): Promise<WorldProof> {
  const enrolled = humans().filter((h) => h.enrolled);
  const enrolledIds = new Set(enrolled.map((h) => h.personId.toLowerCase()));

  // A decision only proves separation of duties if an approver is present and
  // all three ids differ. Decisions with no approver (a clean match) prove
  // creator and receiver only, and are not what this slot is for.
  const candidates = [...decisions].reverse().filter((d) => {
    const a = d.creatorPersonId.toLowerCase();
    const b = d.receiverPersonId.toLowerCase();
    const c = d.approverPersonId.toLowerCase();
    return !ZERO.test(c) && !ZERO.test(a) && !ZERO.test(b) && a !== b && b !== c && a !== c;
  });

  // Prefer one where all three are World ID enrolled people, since that is the
  // claim being made; fall back to any three-distinct decision and say so.
  const best =
    candidates.find(
      (d) =>
        enrolledIds.has(d.creatorPersonId.toLowerCase()) &&
        enrolledIds.has(d.receiverPersonId.toLowerCase()) &&
        enrolledIds.has(d.approverPersonId.toLowerCase()),
    ) ?? candidates[0];

  return {
    environment: process.env.WORLD_ENVIRONMENT ?? "production",
    action: process.env.WORLD_ACTION ?? "zowall-enroll",
    appId: process.env.WORLD_APP_ID ?? null,
    enrolled,
    threeParty: best
      ? {
          decision: best,
          names: {
            creator: nameOf(best.creatorPersonId),
            receiver: nameOf(best.receiverPersonId),
            approver: nameOf(best.approverPersonId),
          },
          allEnrolled:
            enrolledIds.has(best.creatorPersonId.toLowerCase()) &&
            enrolledIds.has(best.receiverPersonId.toLowerCase()) &&
            enrolledIds.has(best.approverPersonId.toLowerCase()),
        }
      : null,
  };
}

export type Proofs = {
  reachable: boolean;
  gate: string | null;
  usdt: string | null;
  chainId: number;
  decisions: ChainDecision[];
  pos: ChainPO[];
  paid: ChainDecision | null;
  topic: TopicProof | null;
  journalEntries: number | null;
  mandate: Awaited<ReturnType<typeof findMandate>>;
  world: WorldProof;
};

export async function loadProofs(origin: string): Promise<Proofs> {
  const env = serverEnv();
  let reachable = true;

  let decisions: ChainDecision[] = [];
  let pos: ChainPO[] = [];
  try {
    decisions = await getDecisions();
  } catch {
    reachable = false;
  }
  try {
    pos = await getPOs();
  } catch {
    reachable = false;
  }

  const [topic, journal, mandate] = await Promise.all([
    env.hederaTopicId ? topicProof(env.hederaTopicId) : Promise.resolve(null),
    getJournal(),
    findMandate(`${origin}/api/x402/resource`).catch(() => null),
  ]);

  return {
    reachable,
    gate: env.gateAddress,
    usdt: env.usdtAddress,
    chainId: env.chainId,
    decisions,
    pos,
    paid: [...decisions].reverse().find((d) => d.outcome === "PAID") ?? null,
    topic,
    journalEntries: journal.error ? null : journal.records.length,
    mandate,
    world: await worldProof(decisions),
  };
}
