import type { AnlageSoDraft } from "./anlage-so";

/**
 * Evidence CSV — every staking payout for the tax year, one row each.
 * This is what the Finanzamt would expect to see if they ever ask for
 * proof of a §22 Nr. 3 entry. Header is in English + German for clarity.
 */
export function renderAnlageSoCsv(draft: AnlageSoDraft): string {
  const lines: string[] = [];
  lines.push(
    [
      "date",
      "coin",
      "quantity",
      "eur_value_at_receipt",
      "eur_price_per_unit",
      "wallet",
      "fx_source",
      "coinbase_tx_id",
      "description",
    ].join(","),
  );
  for (const e of draft.events) {
    const pricePerUnit = e.quantity > 0 ? (e.eurValue / e.quantity).toFixed(8) : "";
    lines.push(
      [
        e.date,
        csvField(e.symbol),
        e.quantity.toFixed(8),
        e.eurValue.toFixed(4),
        pricePerUnit,
        csvField(e.walletName ?? ""),
        csvField(e.fxSource ?? ""),
        csvField(e.coinbaseId ?? ""),
        csvField(e.description ?? ""),
      ].join(","),
    );
  }

  // §23 EStG private sale matches appended below the staking events.
  // Two columns (section + holding flag) make it easy to split in
  // Excel/Google Sheets if a Steuerberater wants them separately.
  if (draft.section23Matches.length > 0) {
    lines.push("");
    lines.push("# §23 EStG private sale matches");
    lines.push(
      ["section", "opened", "closed", "coin", "quantity", "cost_eur", "proceeds_eur", "gain_eur", "holding_days", "is_long_term"].join(","),
    );
    for (const m of draft.section23Matches) {
      lines.push(
        [
          "§23",
          m.openedAt,
          m.closedAt,
          csvField(m.symbol),
          m.qty.toFixed(8),
          m.costEur.toFixed(4),
          m.proceedsEur.toFixed(4),
          m.gainEur.toFixed(4),
          String(m.holdingDays),
          m.isLongTerm ? "true" : "false",
        ].join(","),
      );
    }
  }

  return lines.join("\r\n") + "\r\n";
}

function csvField(s: string): string {
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
