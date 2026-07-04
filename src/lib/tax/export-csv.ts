import type { GermanTaxDraft } from "./german-tax";

/**
 * Evidence CSV — one row per dividend / realised match, with the
 * `formTarget` column identifying which ELSTER Zeile each row feeds.
 * Lets a Steuerberater audit the routing decisions made by the builder.
 */
export function renderEvidenceCsv(draft: GermanTaxDraft): string {
  const head = [
    "date",
    "broker",
    "symbol",
    "ticker",
    "country",
    "grossEur",
    // Row-level FIFO detail (realised matches only): quantity, EUR cost at
    // buy-date FX, EUR proceeds at sale-date FX — the line-by-line answer
    // when the Finanzamt asks why totals differ from broker USD summaries.
    "qty",
    "costEur",
    "proceedsEur",
    "whtEur",
    "ecbRate",
    "formTarget",
    "sourceFingerprint",
  ].join(",");
  const rows = draft.evidence.map((e) =>
    [
      e.date,
      e.broker ?? "",
      e.symbol ?? "",
      e.ticker ?? "",
      e.country ?? "",
      e.grossEur,
      e.qty ?? "",
      e.costEur ?? "",
      e.proceedsEur ?? "",
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
