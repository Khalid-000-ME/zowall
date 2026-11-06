/**
 * Running the middleware for real, against the chain.
 *
 * The mandate is not a fixture. It is an actual purchase order on Whitechain,
 * found by hashing the resource URL and matching it to a PO's specHash - which
 * works because `createPO` already sets specHash to the hash of the order's
 * description, so "the description is the endpoint" needs no contract change.
 *
 * That matters for what a reviewer can check: the thing authorising an agent's
 * spend is a transaction they can open, raised by a World ID verified person,
 * and the quantity it was allowed to buy was signed for by a different one.
 */

import { keccak256, toHex } from "viem";
import type { Bytes32, PurchaseOrder, Roles } from "@zowall/gate-core";
import { Client, PrivateKey } from "@hashgraph/sdk";
import {
  createGuard,
  resourceSpecHash,
  withZowall,
  type GuardDecision,
  type PaymentRequirements,
} from "@zowall/x402";
import {
  GuardianRefused,
  buildAgentSignedTransfer,
  createGuardian,
  guardianQuorum,
  toPayload,
} from "@zowall/x402/hedera";

import { NETWORK, feePayer, verify } from "@/lib/x402-facilitator";

import { getDecisions, getPOs } from "@/lib/chain";

const keccakHex = (data: `0x${string}`) => keccak256(data);

/** The attacks a reviewer should be able to stage without editing anything. */
export type ScenarioId =
  | "honest"
  | "unauthorised"
  | "payee-swap"
  | "price-hike"
  | "replay"
  | "bypass";

export const SCENARIOS: ReadonlyArray<{
  id: ScenarioId;
  title: string;
  blurb: string;
  expect: string;
}> = [
  {
    id: "honest",
    title: "A call the mandate covers",
    blurb: "The agreed endpoint, the agreed payee, the agreed price.",
    expect: "Pays",
  },
  {
    id: "unauthorised",
    title: "An endpoint nobody authorised",
    blurb: "The agent is talked into calling a different paid API.",
    expect: "NO_PO",
  },
  {
    id: "payee-swap",
    title: "The payee swapped at quote time",
    blurb: "The endpoint asks to be paid somewhere other than the agreed address.",
    expect: "PAYEE_MISMATCH",
  },
  {
    id: "price-hike",
    title: "The price raised after the fact",
    blurb: "The same endpoint quotes ten times what the mandate agreed.",
    expect: "PRICE_OVER_TOLERANCE",
  },
  {
    id: "replay",
    title: "The same quote replayed",
    blurb: "A quote that was already decided is presented again.",
    expect: "DUPLICATE_INVOICE",
  },
  {
    id: "bypass",
    title: "The agent skips the middleware",
    blurb:
      "A compromised agent ignores the guard and signs the payment itself. Hedera, not the middleware, refuses.",
    expect: "Refused by the facilitator",
  },
];

export type RunResult = {
  scenario: ScenarioId;
  /** the endpoint the agent was pointed at */
  target: string;
  /** what the server quoted, as it arrived */
  quote: PaymentRequirements | null;
  outcome: "PAID" | "HELD" | "REJECTED" | "NO_QUOTE";
  codes: string[];
  reason: string;
  /** true only if the wallet was asked to authorise a payment */
  signed: boolean;
  mandateId: string | null;
  /** the body the agent ended up with */
  status: number;
  settled: boolean;
  /** what Hedera reported for a payment that went through */
  settlement: { transaction: string; network: string; payer: string } | null;
  /** present for the bypass scenario: what the ledger side did with a payment that skipped the guard */
  bypass: {
    agentAlone: { accepted: boolean; reason: string };
    guardians: { signed: number; refused: string };
  } | null;
};

/** The mandate for a resource: an open PO whose spec is that URL. */
export async function findMandate(resource: string): Promise<PurchaseOrder | null> {
  const want = resourceSpecHash(resource, keccakHex);
  const pos = await getPOs();
  const match = pos.find((p) => p.status === "Open" && p.specHash.toLowerCase() === want.toLowerCase());
  if (!match) return null;

  // getPOs returns the chain's shape; the engine wants the domain shape. Every
  // field is carried across rather than defaulted, so a missing one is a type
  // error here instead of a wrong decision later.
  return {
    id: match.id,
    vendor: match.vendor,
    payee: match.payee,
    specHash: match.specHash,
    qty: match.qty,
    unitPrice: match.unitPrice,
    priceTolBps: match.priceTolBps,
    qtyTolBps: match.qtyTolBps,
    expiry: match.expiry,
    received: match.received,
    invoicedQty: match.invoicedQty,
    invoicedValue: match.invoicedValue,
    creatorPersonId: match.creatorPersonId,
    status: match.status,
  };
}

export function mandateSpecHash(resource: string): Bytes32 {
  return resourceSpecHash(resource, keccakHex);
}

/**
 * The Hedera account an attacker would like to be paid at. It has to be a real
 * account so that a payment that DID reach the ledger would have somewhere to
 * land; here it is the operator account, which is ours and only ever the target
 * of a payment that is refused.
 */
const ATTACKER = () => process.env.HEDERA_ACCOUNT_ID ?? "0.0.800";

/**
 * The URL the agent is pointed at for a given scenario.
 *
 * Only `unauthorised` changes the path. The other attacks keep the same
 * endpoint and change what it quotes, because that is the realistic shape of
 * the problem: the endpoint you agreed to is the one most able to overcharge
 * you.
 */
function targetFor(scenario: ScenarioId, origin: string, resource: string): string {
  const url = new URL(resource);

  switch (scenario) {
    case "unauthorised":
      return `${origin}/api/x402/resource/other`;
    case "payee-swap":
      url.searchParams.set("payTo", ATTACKER());
      return url.toString();
    case "price-hike":
      url.searchParams.set("price", "100000");
      return url.toString();
    default:
      return url.toString();
  }
}

function paymentRig() {
  const payer = process.env.X402_PAYER_ACCOUNT;
  const agentKey = process.env.X402_AGENT_KEY;
  const guardianKeys = (process.env.X402_GUARDIAN_KEYS ?? "").split(",").filter(Boolean);
  const threshold = Number(process.env.X402_GUARDIAN_THRESHOLD ?? "2");
  if (!payer || !agentKey || guardianKeys.length < threshold) return null;
  return {
    payer,
    agent: PrivateKey.fromStringECDSA(agentKey),
    guardians: guardianKeys.map((k) => PrivateKey.fromStringECDSA(k)),
    threshold,
  };
}

export async function runScenario(scenario: ScenarioId, origin: string): Promise<RunResult> {
  const resource = `${origin}/api/x402/resource`;
  const rig = paymentRig();
  if (!rig) {
    throw new Error(
      "X402_PAYER_ACCOUNT, X402_AGENT_KEY and X402_GUARDIAN_KEYS are not set. Run packages/x402/scripts/guardian-setup.ts.",
    );
  }

  // Roles come from the mandate itself once it is found. Until then the
  // creator is unknown, which is fine: with no mandate the answer is NO_PO
  // and the roles never get consulted.
  let roles: Roles = {
    creatorPersonId: "0x0".padEnd(66, "0") as Bytes32,
    receiverPersonId: null,
    approverPersonId: null,
  };

  const mandate = await findMandate(resource).catch(() => null);
  if (mandate) {
    roles = {
      creatorPersonId: mandate.creatorPersonId,
      receiverPersonId: null,
      approverPersonId: null,
    };
  }

  const target = targetFor(scenario, origin, resource);
  const client = Client.forTestnet();

  let captured: GuardDecision | null = null;
  let signed = false;
  let settled = false;
  let settlement: RunResult["settlement"] = null;
  let bypass: RunResult["bypass"] = null;

  const seen = scenario === "replay" ? () => true : () => false;
  const policy = (record?: (d: GuardDecision) => void) =>
    createGuard({
      keccak256: keccakHex,
      // The unauthorised scenario must miss, so the lookup is by the URL that
      // was actually called, not by the one we hoped for.
      findMandate: (r) => findMandate(r),
      roles,
      seen,
      now: () => BigInt(Math.floor(Date.now() / 1000)),
      ...(record ? { record } : {}),
    });

  // The middleware's own guard records the decision for display. Each guardian
  // gets an independent guard of its own: they share no state, because in a real
  // deployment they are separate services run by separate parties.
  const guard = policy((d) => {
    captured = d;
  });
  const guardians = rig.guardians.map((key) =>
    createGuardian({ key, guard: policy(), payer: rig.payer }),
  );

  try {
    if (scenario === "bypass") {
      bypass = await attemptBypass({ client, rig, guardians, target });
    }

    const guarded = withZowall({
      guard,
      signPayment: async (req) => {
        signed = true;
        // The agent signs, then a quorum of guardians each decode the
        // transaction for themselves and sign it only if it does what the quote
        // says and the mandate allows. The payer's key is the threshold
        // structure; without both parts the network will not move the money.
        const bytes = await buildAgentSignedTransfer({
          client,
          requirements: req,
          payer: rig.payer,
          agent: rig.agent,
        });
        const quorum = await guardianQuorum(bytes, req, guardians, rig.threshold);
        return { payload: toPayload(quorum.bytes) };
      },
      onSettled: (s) => {
        settled = true;
        settlement = {
          transaction: s.transactionId ?? s.transaction ?? "",
          network: s.network,
          payer: s.payer,
        };
      },
    });

    // A guardian refusing surfaces as a thrown error from signPayment. That is
    // still a refusal, so report it as one rather than as a server fault.
    let response: Response;
    try {
      response = await guarded(target, { method: "GET" });
    } catch (err) {
      if (!(err instanceof GuardianRefused)) throw err;
      response = new Response(JSON.stringify({ error: err.message }), { status: 402 });
    }

    const decision = captured as GuardDecision | null;

    return {
      scenario,
      target,
      quote: decision?.requirements ?? null,
      outcome: scenario === "bypass" ? "REJECTED" : decision ? decision.decision.outcome : "NO_QUOTE",
      codes: decision ? decision.decision.codes : [],
      reason:
        scenario === "bypass"
          ? "The payment skipped the guard, so Hedera refused it."
          : (decision?.reason ?? "The endpoint did not ask to be paid."),
      signed: scenario === "bypass" ? false : signed,
      mandateId: decision?.mandate ? decision.mandate.id.toString() : null,
      status: scenario === "bypass" ? 402 : response.status,
      settled,
      settlement,
      bypass,
    };
  } finally {
    client.close();
  }
}

/**
 * What happens when the agent is compromised and does not call the guard at all.
 *
 * Two attempts, both against the real facilitator and the real guardians:
 *
 *  1. The agent signs a payment to the attacker by itself and submits it. The
 *     facilitator checks the signatures against the payer account's key on the
 *     ledger, finds the guardians missing, and refuses.
 *  2. The agent, or a hacked middleware, lies to the guardians: it shows them a
 *     quote naming the authorised merchant and a transaction paying the
 *     attacker. Each guardian decodes the transaction and sees it does not
 *     match, so none signs.
 */
async function attemptBypass(opts: {
  client: Client;
  rig: NonNullable<ReturnType<typeof paymentRig>>;
  guardians: ReturnType<typeof createGuardian>[];
  target: string;
}): Promise<NonNullable<RunResult["bypass"]>> {
  const { client, rig, guardians } = opts;
  const fee = await feePayer();

  const toAttacker: PaymentRequirements = {
    scheme: "exact",
    network: NETWORK,
    amount: "10000",
    asset: "0.0.0",
    payTo: ATTACKER(),
    resource: opts.target,
    description: "a payment the guard never saw",
    maxTimeoutSeconds: 60,
    extra: { feePayer: fee },
  };

  const bytes = await buildAgentSignedTransfer({
    client,
    requirements: toAttacker,
    payer: rig.payer,
    agent: rig.agent,
  });

  const accepted = {
    scheme: toAttacker.scheme,
    network: toAttacker.network,
    amount: toAttacker.amount,
    asset: toAttacker.asset,
    payTo: toAttacker.payTo,
    maxTimeoutSeconds: toAttacker.maxTimeoutSeconds,
    extra: toAttacker.extra,
  };
  const checked = await verify({
    paymentPayload: {
      x402Version: 2,
      resource: { url: toAttacker.resource, description: toAttacker.description },
      accepted,
      payload: toPayload(bytes),
    },
    paymentRequirements: accepted,
  });

  // The lie: ask the guardians to sign this transaction while presenting a quote
  // for the merchant the mandate does allow.
  const honestQuote: PaymentRequirements = {
    ...toAttacker,
    payTo: process.env.X402_PAY_TO ?? toAttacker.payTo,
    description: "what the middleware claims it is paying",
  };
  let signedCount = 0;
  let refused = "";
  try {
    const q = await guardianQuorum(bytes, honestQuote, guardians, rig.threshold);
    signedCount = q.signed;
  } catch (err) {
    refused = err instanceof GuardianRefused ? err.problems.join("; ") : String(err);
  }

  return {
    agentAlone: {
      accepted: checked.isValid,
      reason: checked.invalidMessage ?? checked.invalidReason ?? (checked.isValid ? "accepted" : "refused"),
    },
    guardians: { signed: signedCount, refused },
  };
}

/** How many decisions the gate has on record, for the "is it live" line. */
export async function decisionCount(): Promise<number> {
  try {
    return (await getDecisions()).length;
  } catch {
    return 0;
  }
}

export const RESOURCE_PATH = "/api/x402/resource";
export { toHex };
