// Legacy CSV evidence writer — rewritten in Step 6 alongside the PDF.
import type { LegacyGermanTaxDraft as GermanTaxDraft } from "./german-tax";

export function renderEvidenceCsv(draft: GermanTaxDraft): string {
  const head = ["date","symbol","ticker","country","grossEur","whtEur","ecbRate","sourceFingerprint"].join(",");
  const rows = draft.evidence.map(e => [
    e.date,
    e.symbol ?? "",
    e.ticker ?? "",
    e.country ?? "",
    e.grossEur,
    e.whtEur ?? "",
    e.ecbRate ?? "",
    e.fingerprint,
  ].map(escapeCsv).join(","));
  return [head, ...rows].join("\n");
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
