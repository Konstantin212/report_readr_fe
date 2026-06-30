// Legacy CSV exporter — uses the back-compat draft shape. Will be rewritten
// alongside export-pdf.tsx in Step 6 of the KAP/KAP-INV split.
import type { LegacyGermanTaxDraft as GermanTaxDraft, KapEvidenceItem } from "@/lib/tax/german-tax";

const csvColumns = ["date","ticker","symbol","country","grossEur","whtEur","ecbRate","fingerprint"] as const;

export function buildTaxEvidenceCsv(draft: GermanTaxDraft): string {
  const rows = draft.evidence.map((item: KapEvidenceItem) =>
    [
      item.date,
      item.ticker ?? "",
      item.symbol ?? "",
      item.country ?? "",
      item.grossEur,
      item.whtEur ?? "",
      item.ecbRate ?? "",
      item.fingerprint,
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  return [csvColumns.join(","), ...rows].join("\n");
}

export function buildTaxEvidenceJson(draft: GermanTaxDraft) {
  return {
    taxYear: draft.taxYear,
    lines: draft.lines,
    evidence: draft.evidence,
  };
}

function escapeCsvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
