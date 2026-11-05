/**
 * Verify a decision the way a stranger would: from the event log and nothing
 * else. No access to our database, no knowledge of the purchase order, no
 * numbers supplied by us.
 *
 *   node packages/e2e/src/verify-decision.ts <txHash>
 */

import { createPublicClient, keccak256, parseEventLogs, decodeAbiParameters } from "viem";
import { codesOf, formatUsdt, REASON_TEXT } from "@zowall/gate-core";

import { GATE_ABI } from "./abi.ts";
import { transport, whitechainSepolia } from "./chain.ts";

const hash = process.argv[2] as `0x${string}`;
if (!hash) throw new Error("usage: verify-decision.ts <txHash>");

const pub = createPublicClient({ chain: whitechainSepolia, transport: transport() });
const receipt = await pub.getTransactionReceipt({ hash });
const [event] = parseEventLogs({ abi: GATE_ABI, eventName: "Decision", logs: receipt.logs });
if (!event) throw new Error("no Decision event in that transaction");

const a = event.args;

// 1. The digest must be the hash of the preimage the log carries.
const recomputed = keccak256(a.preimage);
const digestOk = recomputed.toLowerCase() === a.journalDigest.toLowerCase();

// 2. The preimage decodes to the facts of the decision, with no help from us.
const [
  chainId, gate, poId, invoiceHash, outcome, reasonMask,
  invQty, recvQty, invUnitPrice, poUnitPrice,
  creator, receiver, approver, nonce,
] = decodeAbiParameters(
  [
    { type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" },
    { type: "uint8" }, { type: "uint32" }, { type: "uint128" }, { type: "uint128" },
    { type: "uint128" }, { type: "uint128" }, { type: "bytes32" }, { type: "bytes32" },
    { type: "bytes32" }, { type: "uint256" },
  ],
  a.preimage,
);

const codes = codesOf(Number(reasonMask));

console.log(`decision in ${hash}\n`);
console.log("recovered from the log alone:");
console.log(`  chain            ${chainId}`);
console.log(`  gate             ${gate}`);
console.log(`  purchase order   #${poId}`);
console.log(`  invoice          ${invoiceHash}`);
console.log(`  outcome          ${["PAID", "HELD", "REJECTED"][Number(outcome)]}`);
console.log(`  reason codes     ${codes.join(", ") || "none"}`);
for (const c of codes) console.log(`                   ${REASON_TEXT[c]}`);
console.log(`  invoiced         ${invQty} @ ${formatUsdt(invUnitPrice)} USDT`);
console.log(`  received         ${recvQty} @ ${formatUsdt(poUnitPrice)} USDT agreed`);
console.log(`  creator          ${String(creator).slice(0, 18)}…`);
console.log(`  receiver         ${String(receiver).slice(0, 18)}…`);
console.log(`  approver         ${approver === `0x${"00".repeat(32)}` ? "none" : String(approver).slice(0, 18) + "…"}`);
console.log(`  nonce            ${nonce}`);
console.log(`\n  preimage         ${(a.preimage.length - 2) / 2} bytes`);
console.log(`  keccak(preimage) ${recomputed}`);
console.log(`  digest in event  ${a.journalDigest}`);
console.log(`\n  SELF-CONSISTENT: ${digestOk ? "yes" : "NO"}`);
console.log(
  `\nThis digest is what the Hedera journal entry carries. Match it against the\n` +
    `topic and the two records are the same decision.`,
);
if (!digestOk) process.exit(1);
