import type { GermanTaxDraft } from "@/lib/tax/german-tax";

const csvColumns = ["line", "date", "broker", "accountNumber", "type", "symbol", "isin", "currency", "amount"] as const;

export function buildTaxEvidenceCsv(draft: GermanTaxDraft): string {
  const rows = draft.evidence.map((item) =>
    [
      item.line,
      item.date,
      item.broker,
      item.accountNumber,
      item.type,
      item.symbol ?? "",
      item.isin ?? "",
      item.currency,
      item.amount,
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  return [csvColumns.join(","), ...rows].join("\n");
}

export function buildTaxEvidenceJson(draft: GermanTaxDraft) {
  return {
    taxYear: draft.taxYear,
    filingReady: draft.filingReady,
    lines: draft.lines,
    reviewItems: draft.reviewItems,
    evidence: draft.evidence,
  };
}

function escapeCsvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
