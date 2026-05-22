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
  return lines.join("\r\n") + "\r\n";
}

function csvField(s: string): string {
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
