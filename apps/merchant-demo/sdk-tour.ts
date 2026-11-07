/**
 * The seller and the buyer side of the SDK, in one short script.
 *
 *   ZOWALL_API_KEY=sk_live_...   a vendor key from /app/keys
 *   pnpm --filter merchant-demo tour
 *
 * It registers an x402 endpoint through the SDK. Zowall calls the endpoint, and the
 * endpoint's own 402 has to name the payee and the price given here. Then it does what
 * a buyer's agent does first: asks the registry what is verified.
 */

import { RegistryError, discoverEndpoints, registerEndpoint } from "@zowall/sdk";

const baseUrl = process.env["ZOWALL_URL"] ?? "http://localhost:3000";
const apiKey = process.env["ZOWALL_API_KEY"];
if (!apiKey) throw new Error("ZOWALL_API_KEY is not set. Create a vendor key at /app/keys.");

// The sample endpoint that ships with the app. Its payee is the account in X402_PAY_TO.
const payTo = process.env["X402_PAY_TO"];
if (!payTo) throw new Error("X402_PAY_TO is not set");

console.log("1. Register an endpoint");
try {
  const e = await registerEndpoint(
    { baseUrl, apiKey },
    {
      name: "Hourly forecast",
      description: "One forecast for the next hour",
      url: `${baseUrl}/api/x402/resource`,
      payTo,
      amount: "10000", // tinybars: 0.0001 HBAR
      tags: ["weather"],
    },
  );
  console.log(`   ${e.name}: ${e.status}`);
  for (const reason of e.verification?.reasons ?? []) console.log(`   - ${reason}`);
} catch (err) {
  if (!(err instanceof RegistryError) || err.status !== 409) throw err;
  console.log("   already registered and verified");
}

console.log("\n2. What a buyer's agent sees");
const { total, endpoints } = await discoverEndpoints({ baseUrl }, { tag: "weather" });
console.log(`   ${total} verified endpoint${total === 1 ? "" : "s"}`);
for (const e of endpoints) console.log(`   ${e.name}  ${e.url}  ${e.amount} ${e.asset}  -> ${e.payTo}`);
