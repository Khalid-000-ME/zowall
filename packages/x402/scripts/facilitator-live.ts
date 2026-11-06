/**
 * Take a guarded payment to a real x402 facilitator on Hedera testnet.
 *
 *   set -a; source .env.local; set +a
 *   node packages/x402/scripts/facilitator-live.ts
 *
 * Two payments for the same quote: one the agent signs alone, one the agent and
 * a guardian quorum sign. The facilitator verifies the signatures against the
 * payer's on-ledger key, so the first is refused by it and the second settles.
 */

import { AccountId, Client, PrivateKey, Transaction } from "@hashgraph/sdk";

import {
  buildAgentSignedTransfer,
  createGuardian,
  guardianQuorum,
  toPayload,
} from "../src/hedera.ts";
import { encodeHeader, type PaymentRequirements } from "../src/types.ts";

const need = (n: string) => {
  const v = process.env[n];
  if (!v) throw new Error(`${n} is not set`);
  return v;
};

const facilitator = process.env["FACILITATOR_URL"] ?? "https://x402.org/facilitator";
const payer = need("X402_PAYER_ACCOUNT");
const payTo = need("X402_PAY_TO");
const agent = PrivateKey.fromStringECDSA(need("X402_AGENT_KEY"));
const guardianKeys = need("X402_GUARDIAN_KEYS").split(",").map((k) => PrivateKey.fromStringECDSA(k));

const client = Client.forTestnet();

async function feePayer(): Promise<string> {
  const res = await fetch(`${facilitator}/supported`);
  const j = (await res.json()) as { kinds: Array<{ network: string; extra?: { feePayer?: string } }> };
  const k = j.kinds.find((x) => x.network === "hedera:testnet");
  if (!k?.extra?.feePayer) throw new Error("facilitator does not advertise a Hedera testnet fee payer");
  return k.extra.feePayer;
}

const fp = await feePayer();
console.log(`facilitator ${facilitator}   fee payer ${fp}`);

const requirements: PaymentRequirements = {
  scheme: "exact",
  network: "hedera:testnet",
  amount: "1000",
  asset: "0.0.0",
  payTo,
  resource: "https://zowall.local/api/x402/resource",
  description: "live check",
  maxTimeoutSeconds: 60,
  extra: { feePayer: fp },
};
requirements.raw = { ...requirements } as unknown as Record<string, unknown>;
delete (requirements.raw as { raw?: unknown })["raw"];

const accepted = {
  scheme: requirements.scheme,
  network: requirements.network,
  amount: requirements.amount,
  asset: requirements.asset,
  payTo: requirements.payTo,
  maxTimeoutSeconds: requirements.maxTimeoutSeconds,
  extra: requirements.extra,
};

async function call(path: "verify" | "settle", bytes: Uint8Array) {
  const res = await fetch(`${facilitator}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      x402Version: 2,
      paymentPayload: {
        x402Version: 2,
        resource: { url: requirements.resource, description: requirements.description },
        accepted,
        payload: toPayload(bytes),
      },
      paymentRequirements: accepted,
    }),
  });
  return (await res.json()) as Record<string, unknown>;
}

console.log("\nA. agent alone");
const alone = await buildAgentSignedTransfer({ client, requirements, payer, agent });
console.log("   verify ->", JSON.stringify(await call("verify", alone)));

console.log("\nB. agent + guardian quorum (each guardian decodes the transaction itself)");
const allow = {
  check: async () =>
    ({
      allowed: true,
      reason: "matched",
      decision: { outcome: "PAID", codes: [], violations: [], payableAmount: 0n, reasonMask: 0 },
    }) as never,
};
const guardians = guardianKeys.map((key) => createGuardian({ key, guard: allow, payer }));
const q = await guardianQuorum(alone, requirements, guardians, 2);
console.log(`   ${q.signed} guardians signed`);
console.log("   verify ->", JSON.stringify(await call("verify", q.bytes)));

if (process.argv.includes("--settle")) {
  console.log("\nC. settle");
  console.log("   settle ->", JSON.stringify(await call("settle", q.bytes)));
}

void AccountId;
void Transaction;
void encodeHeader;
client.close();
