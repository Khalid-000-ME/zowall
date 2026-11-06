/**
 * Everything the proofs page shows, read from somewhere a stranger can also
 * read it: the Hedera mirror node, the Whitechain gate, the enrolment
 * registry. Nothing here is a typed-in claim.
 *
 * Each reader fails soft. A proofs page that errors out when one node is
 * having a bad minute is worse than useless in front of a judge, so a failed
 * read comes back as `null` and the page says it could not confirm that item.
 */

import {
  getDecisions,
  getPOs,
  getResolutions,
  publicClient,
  type ChainDecision,
  type ChainPO,
  type ChainResolution,
} from "@/lib/chain";
import { GATE_ABI } from "@zowall/sdk";
import { accountKeyTree, describe } from "@/lib/hedera-key";
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
  /** the account that pays the topic's renewal; without one an admin-less topic would expire */
  autoRenewAccount: string | null;
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
      auto_renew_account?: string | null;
    };
    return {
      topicId,
      adminKey: j.admin_key ?? null,
      submitKeySet: j.submit_key != null,
      memo: j.memo ?? "",
      autoRenewAccount: j.auto_renew_account ?? null,
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
  /**
   * The most recent held invoice that a person decided, where the order's
   * creator, its receiver and the approver are three different people.
   */
  threeParty: {
    resolution: ChainResolution;
    names: { creator: string; receiver: string; approver: string };
    allEnrolled: boolean;
  } | null;
};

const ZERO = /^0x0+$/;

export async function worldProof(resolutions: ChainResolution[], pos: ChainPO[]): Promise<WorldProof> {
  const enrolled = humans();
  const enrolledIds = new Set(enrolled.map((h) => h.personId.toLowerCase()));
  const poById = new Map(pos.map((p) => [p.id, p]));

  // A resolution only proves separation of duties if the order's creator and
  // receiver are both recorded and all three ids differ.
  const candidates = [...resolutions].reverse().flatMap((r) => {
    const po = poById.get(r.poId);
    if (!po) return [];
    const a = po.creatorPersonId.toLowerCase();
    const b = po.receiverPersonId.toLowerCase();
    const c = r.approverPersonId.toLowerCase();
    if (ZERO.test(a) || ZERO.test(b) || ZERO.test(c)) return [];
    if (a === b || b === c || a === c) return [];
    return [{ r, po }];
  });

  // Prefer one where all three are enrolled, since that is the claim being made.
  const best =
    candidates.find(
      ({ r, po }) =>
        enrolledIds.has(po.creatorPersonId.toLowerCase()) &&
        enrolledIds.has(po.receiverPersonId.toLowerCase()) &&
        enrolledIds.has(r.approverPersonId.toLowerCase()),
    ) ?? candidates[0];

  return {
    environment: process.env.WORLD_ENVIRONMENT ?? "production",
    action: process.env.WORLD_ACTION ?? "zowall-enroll",
    appId: process.env.WORLD_APP_ID ?? null,
    enrolled,
    threeParty: best
      ? {
          resolution: best.r,
          names: {
            creator: nameOf(best.po.creatorPersonId),
            receiver: nameOf(best.po.receiverPersonId),
            approver: nameOf(best.r.approverPersonId),
          },
          allEnrolled:
            enrolledIds.has(best.po.creatorPersonId.toLowerCase()) &&
            enrolledIds.has(best.po.receiverPersonId.toLowerCase()) &&
            enrolledIds.has(best.r.approverPersonId.toLowerCase()),
        }
      : null,
  };
}

export type Quorum = { threshold: number; attestors: string[] };

/** The attestor quorum, read from the gate itself rather than from our config. */
export async function readQuorum(gate: `0x${string}`): Promise<Quorum | null> {
  try {
    const [threshold, attestors] = await Promise.all([
      publicClient().readContract({ address: gate, abi: GATE_ABI, functionName: "threshold" }),
      publicClient().readContract({ address: gate, abi: GATE_ABI, functionName: "attestors" }),
    ]);
    return { threshold: Number(threshold), attestors: [...(attestors as readonly string[])] };
  } catch {
    return null;
  }
}

export type GuardianProof = {
  payer: string | null;
  /** "2 of [ ECDSA key, 2 of [ ... ] ]", decoded from the ledger's own record of the key */
  keyStructure: string | null;
};

export async function guardianProof(): Promise<GuardianProof> {
  const payer = process.env.X402_PAYER_ACCOUNT ?? null;
  if (!payer) return { payer: null, keyStructure: null };
  const tree = await accountKeyTree(payer);
  return { payer, keyStructure: tree ? describe(tree) : null };
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
  quorum: Quorum | null;
  guardian: GuardianProof;
};

export async function loadProofs(origin: string): Promise<Proofs> {
  const env = serverEnv();
  let reachable = true;

  let decisions: ChainDecision[] = [];
  let pos: ChainPO[] = [];
  let resolutions: ChainResolution[] = [];
  try {
    resolutions = await getResolutions();
  } catch {
    reachable = false;
  }
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

  const [topic, journal, mandate, quorum, guardian] = await Promise.all([
    env.hederaTopicId ? topicProof(env.hederaTopicId) : Promise.resolve(null),
    getJournal(),
    findMandate(`${origin}/api/x402/resource`).catch(() => null),
    env.gateAddress ? readQuorum(env.gateAddress) : Promise.resolve(null),
    guardianProof(),
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
    world: await worldProof(resolutions, pos),
    quorum,
    guardian,
  };
}
