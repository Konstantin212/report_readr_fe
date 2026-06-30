import type { GermanTaxDraft } from "./german-tax";

/**
 * Evidence CSV — one row per dividend / realised match, with the
 * `formTarget` column identifying which ELSTER Zeile each row feeds.
 * Lets a Steuerberater audit the routing decisions made by the builder.
 */
export function renderEvidenceCsv(draft: GermanTaxDraft): string {
  const head = [
    "date",
    "symbol",
    "ticker",
    "country",
    "grossEur",
    "whtEur",
    "ecbRate",
    "formTarget",
    "sourceFingerprint",
  ].join(",");
  const rows = draft.evidence.map((e) =>
    [
      e.date,
      e.symbol ?? "",
      e.ticker ?? "",
      e.country ?? "",
      e.grossEur,
      e.whtEur ?? "",
      e.ecbRate ?? "",
      e.formTarget ?? "",
      e.fingerprint,
    ].map(escapeCsv).join(","),
  );
  return [head, ...rows].join("\n");
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
