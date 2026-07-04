/**
 * Vorabpauschale (§18 InvStG 2018) — pure arithmetic core.
 *
 * German law taxes a fictitious minimum yield on investment funds every
 * year so accumulating (thesaurierende) funds can't defer tax forever:
 *
 *   Basisertrag(Y)    = value(Jan-1 of Y) × Basiszins(Y) × 0.7
 *   Vorabpauschale(Y) = max(0, min(Basisertrag − distributions(Y),
 *                                  max(0, value(Dec-31) − value(Jan-1))))
 *
 * The result for holding-year Y is deemed received on the FIRST WORKING DAY
 * of Y+1 — i.e. it is income of tax year Y+1 (the caller owns that shift).
 * It is entered GROSS on Anlage KAP-INV (Vorabpauschale block, per fund
 * subtype); ELSTER applies the Teilfreistellung, same as for distributions.
 *
 * This module is the v2-ready core — see docs/vorabpauschale-design.md.
 * v1 ships the math + tests and a warning-only guard in the KAP builder;
 * automatic wiring waits on reliable year-boundary NAVs per fund.
 */
import Decimal from "decimal.js";

/**
 * BMF-published Basiszins per holding year, in percent.
 * Sources: BMF-Schreiben "Basiszins zur Berechnung der Vorabpauschale"
 * (published each January from Bundesbank yield data).
 * Negative published rates floor to 0 — kept verbatim here; the compute
 * clamps. A missing year returns null from `basiszinsFor` so callers warn
 * instead of silently using a stale rate.
 */
export const BASISZINS_PCT: Record<number, number> = {
  2018: 0.87,
  2019: 0.52,
  2020: 0.07,
  2021: -0.45, // negative → Vorabpauschale 0
  2022: -0.05, // negative → Vorabpauschale 0
  2023: 2.55,
  2024: 2.29,
  2025: 2.53,
};

export function basiszinsFor(holdingYear: number): number | null {
  return BASISZINS_PCT[holdingYear] ?? null;
}

export type VorabpauschaleInput = {
  /** Position value in EUR on Jan 1 of the holding year. */
  startValueEur: string;
  /** Position value in EUR on Dec 31 of the holding year. */
  endValueEur: string;
  /** Distributions received from the fund during the holding year (EUR). */
  distributionsEur: string;
  /** BMF Basiszins for the holding year, in percent (e.g. 2.29). */
  basiszinsPct: number;
  /**
   * Pro-rata factor for shares acquired during the holding year:
   * reduced by 1/12 for each FULL month preceding the acquisition month
   * (§18 Abs. 2 InvStG). 1 for positions held since Jan 1. Use
   * `acquisitionMonthsFactor` to derive it from a purchase date.
   */
  monthsFactor?: number;
};

/**
 * Vorabpauschale for one position and one holding year, in EUR (2 dp).
 * Never negative. Zero when the Basiszins is ≤ 0 or the fund lost value.
 */
export function computeVorabpauschale(input: VorabpauschaleInput): string {
  const start = new Decimal(input.startValueEur || "0");
  const end = new Decimal(input.endValueEur || "0");
  const dist = new Decimal(input.distributionsEur || "0");
  const factor = new Decimal(input.monthsFactor ?? 1);

  if (input.basiszinsPct <= 0) return "0.00";

  const basisertrag = start
    .mul(input.basiszinsPct)
    .div(100)
    .mul("0.7")
    .mul(factor);

  const valueGain = Decimal.max(0, end.minus(start));
  const vap = Decimal.max(0, Decimal.min(basisertrag.minus(dist), valueGain));
  return vap.toFixed(2);
}

/**
 * §18 Abs. 2 InvStG pro-rating: the Vorabpauschale of shares bought during
 * the holding year is reduced by 1/12 for each full month that preceded the
 * month of acquisition. Bought in January (or held since before the year) →
 * 12/12; bought in March → 10/12; bought in December → 1/12.
 */
export function acquisitionMonthsFactor(acquiredAt: string, holdingYear: number): number {
  const d = new Date(acquiredAt);
  if (Number.isNaN(d.getTime())) return 1;
  if (d.getFullYear() < holdingYear) return 1;
  if (d.getFullYear() > holdingYear) return 0;
  const month = d.getMonth() + 1; // 1-12
  return (12 - (month - 1)) / 12;
}
