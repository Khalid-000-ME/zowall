import { NextResponse } from "next/server";
import { REASON_TEXT, formatUsdt } from "@zowall/gate-core";

import { getDecisions, getPO } from "@/lib/chain";
import { hashscanTopic, txUrl } from "@/lib/chains";
import { serverEnv } from "@/lib/env";
import { nameOf } from "@/lib/humans";
import { getJournal } from "@/lib/journal-read";
import { describe } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * The accountant's packet.
 *
 * An auditor testing the three-way match wants one row per decision with the
 * reason it went that way and a link to check it. CSV because that is what
 * actually gets opened, JSON because that is what gets re-processed.
 *
 * Built from the chain and the Hedera topic, not from anything this app
 * remembers, so the file is the same one a stranger could produce.
 *
 *   /api/export            -> csv
 *   /api/export?format=json
 */
export async function GET(request: Request) {
  const env = serverEnv();
  const format = new URL(request.url).searchParams.get("format") ?? "csv";

  if (!env.gateAddress) {
    return NextResponse.json({ error: "GATE_ADDRESS is not set" }, { status: 503 });
  }

  const [decisions, journal] = await Promise.all([getDecisions(), getJournal()]);

  const rows = await Promise.all(
    decisions.map(async (d) => {
      const po = await getPO(d.poId);
      const entry = journal.byTx.get(d.txHash.toLowerCase());
      return {
        decidedAt: new Date(d.timestamp * 1000).toISOString(),
        poId: d.poId.toString(),
        description: describe(d.poId) ?? "",
        vendor: po?.vendor ?? "",
        payee: po?.payee ?? "",
        invoiceHash: d.invoiceHash,
        outcome: d.outcome,
        reasonCodes: d.codes.join(" "),
        reasons: d.codes.map((c) => REASON_TEXT[c]).join(" "),
        invoicedQty: d.invQty.toString(),
        receivedQty: d.recvQty.toString(),
        invoiceUnitPrice: formatUsdt(d.invUnitPrice),
        poUnitPrice: formatUsdt(d.poUnitPrice),
        paidUsdt: formatUsdt(d.paid ?? 0n),
        holdId: d.holdId && d.holdId > 0n ? d.holdId.toString() : "",
        creator: nameOf(d.creatorPersonId),
        receiver: nameOf(d.receiverPersonId),
        journalDigest: d.journalDigest,
        evmTx: d.txHash,
        evmTxUrl: txUrl(env.chainId, d.txHash) ?? "",
        hederaSequence: entry ? String(entry.sequenceNumber) : "",
        hederaConsensus: entry?.consensusTimestamp ?? "",
        journalAgrees: entry ? String(entry.entry.dig.toLowerCase() === d.journalDigest.toLowerCase()) : "",
      };
    }),
  );

  if (format === "json") {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      chainId: env.chainId,
      gateAddress: env.gateAddress,
      hederaTopicId: env.hederaTopicId,
      hederaTopicUrl: env.hederaTopicId ? hashscanTopic(env.hederaTopicId) : null,
      decisions: rows,
    });
  }

  const headers = rows[0]
    ? Object.keys(rows[0])
    : ["decidedAt", "poId", "outcome", "reasonCodes", "evmTx"];

  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers.map((h) => csvCell((row as Record<string, string>)[h] ?? "")).join(","),
    ),
  ].join("\n");

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="zowall-decisions-${Date.now()}.csv"`,
    },
  });
}

/**
 * Quote anything a spreadsheet would mangle. A leading = + - @ is also
 * prefixed, because a reason string starting with one of those is a formula
 * injection waiting for someone to open the file.
 */
function csvCell(value: string): string {
  const needsPrefix = /^[=+\-@\t\r]/.test(value);
  const safe = needsPrefix ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
