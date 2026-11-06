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
import {
  createGuard,
  resourceSpecHash,
  withZowall,
  type GuardDecision,
  type PaymentRequirements,
} from "@zowall/x402";

import { getDecisions, getPOs } from "@/lib/chain";

const keccakHex = (data: `0x${string}`) => keccak256(data);

/** The attacks a reviewer should be able to stage without editing anything. */
export type ScenarioId =
  | "honest"
  | "unauthorised"
  | "payee-swap"
  | "price-hike"
  | "replay";

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
 * The URL the agent is pointed at for a given scenario.
 *
 * Only `unauthorised` changes the path. The other attacks keep the same
 * endpoint and change what it quotes, because that is the realistic shape of
 * the problem: the endpoint you agreed to is the one most able to overcharge
 * you.
 */
function targetFor(
  scenario: ScenarioId,
  origin: string,
  resource: string,
  agreedPayee: string | null,
): string {
  const url = new URL(resource);

  // The stand-in endpoint has to quote the payee the mandate actually names,
  // or every scenario would report a payee mismatch and the other attacks
  // would be invisible behind it. Query parameters are safe to add: the quote
  // declares its `resource` as the bare path, so the mandate still matches.
  if (agreedPayee) url.searchParams.set("payTo", agreedPayee);

  switch (scenario) {
    case "unauthorised":
      return `${origin}/api/x402/resource/other`;
    case "payee-swap":
      url.searchParams.set("payTo", "0x000000000000000000000000000000000000dEaD");
      return url.toString();
    case "price-hike":
      url.searchParams.set("price", "100000");
      return url.toString();
    default:
      return url.toString();
  }
}

export async function runScenario(scenario: ScenarioId, origin: string): Promise<RunResult> {
  const resource = `${origin}/api/x402/resource`;

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

  const target = targetFor(scenario, origin, resource, mandate ? mandate.payee : null);

  let captured: GuardDecision | null = null;
  let signed = false;
  let settled = false;

  const guard = createGuard({
    keccak256: keccakHex,
    // The unauthorised scenario must miss, so the lookup is by the URL that
    // was actually called, not by the one we hoped for.
    findMandate: (r) => findMandate(r),
    roles,
    seen: scenario === "replay" ? () => true : () => false,
    now: () => BigInt(Math.floor(Date.now() / 1000)),
    record: (d) => {
      captured = d;
    },
  });

  const guarded = withZowall({
    guard,
    signPayment: async () => {
      signed = true;
      // A real deployment hands this to an x402 client, which signs with the
      // agent's wallet. Nothing here holds a key, so the header is a marker
      // that the gate allowed the payment, not an authorisation to move money.
      return Buffer.from(
        JSON.stringify({ x402Version: 1, scheme: "exact", note: "allowed by zowall" }),
      ).toString("base64");
    },
    onSettled: () => {
      settled = true;
    },
  });

  const response = await guarded(target, { method: "GET" });
  const decision = captured as GuardDecision | null;

  return {
    scenario,
    target,
    quote: decision?.requirements ?? null,
    outcome: decision ? decision.decision.outcome : "NO_QUOTE",
    codes: decision ? decision.decision.codes : [],
    reason: decision?.reason ?? "The endpoint did not ask to be paid.",
    signed,
    mandateId: decision?.mandate ? decision.mandate.id.toString() : null,
    status: response.status,
    settled,
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
