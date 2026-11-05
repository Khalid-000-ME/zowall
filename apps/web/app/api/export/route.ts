import { NextResponse } from "next/server";
import { REASON_TEXT, formatUsdt } from "@zowall/gate-core";

import { decisions, purchaseOrders } from "@/lib/store";
import { serverEnv } from "@/lib/env";
import { hashscanTopic, txUrl } from "@/lib/chains";

/**
 * The accountant's packet.
 *
 * An auditor testing the three-way match wants one row per decision with the
 * reason it went that way and a link to check it. CSV because that is what
 * actually gets opened, JSON because that is what gets re-processed.
 *
 *   /api/export            -> csv
 *   /api/export?format=json
 */
export async function GET(request: Request) {
  const env = serverEnv();
  const format = new URL(request.url).searchParams.get("format") ?? "csv";

  const rows = decisions.all().map((d) => {
    const po = purchaseOrders.get(d.poId);
    return {
      decidedAt: new Date(d.at).toISOString(),
      poId: d.poId.toString(),
      description: po?.description ?? "",
      vendor: po?.vendor ?? "",
      payee: po?.payee ?? "",
      invoiceHash: d.invoiceHash,
      outcome: d.outcome,
      reasonCodes: d.codes.join(" "),
      reasons: d.codes.map((c) => REASON_TEXT[c]).join(" "),
      invoicedQty: d.qty.toString(),
      receivedQty: po?.received.toString() ?? "",
      invoiceUnitPrice: formatUsdt(d.unitPrice),
      poUnitPrice: po ? formatUsdt(po.unitPrice) : "",
      paidUsdt: formatUsdt(d.paid),
      holdId: d.holdId?.toString() ?? "",
      journalDigest: d.journalDigest,
      evmTx: d.txHash ?? "",
      evmTxUrl: d.txHash ? (txUrl(env.chainId, d.txHash) ?? "") : "",
      hederaTxId: d.hederaTxId ?? "",
    };
  });

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

  const headers = Object.keys(
    rows[0] ?? {
      decidedAt: "",
      poId: "",
      description: "",
      vendor: "",
      payee: "",
      invoiceHash: "",
      outcome: "",
      reasonCodes: "",
      reasons: "",
      invoicedQty: "",
      receivedQty: "",
      invoiceUnitPrice: "",
      poUnitPrice: "",
      paidUsdt: "",
      holdId: "",
      journalDigest: "",
      evmTx: "",
      evmTxUrl: "",
      hederaTxId: "",
    },
  );

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
