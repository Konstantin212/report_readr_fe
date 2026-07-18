/**
 * ELSTER Anlage KAP-INV Vorabpauschale worksheet (lines 30–45), per fund.
 *
 * §18 InvStG: the advance lump sum is the lower of the Basisertrag
 * (opening value × Basiszins × 70 %) and the actual value gain, reduced by the
 * year's distributions, pro-rated by 1/12 per full month preceding acquisition
 * (§18 Abs. 2), and deemed received on the first working day of the FOLLOWING
 * year (§18 Abs. 3) — so a 2024 holding year belongs to the 2025 return.
 *
 * Two field-level rules are encoded here because both cost real time during the
 * 2025 filing and ELSTER's validator is unforgiving:
 *
 *  - **Line 36 repeats the OPENING price** (line 33). It is not the closing −
 *    opening delta; ELSTER derives the Mehrbetrag itself. Entering the delta
 *    silently produces a wrong Vorabpauschale.
 *  - **Line 42 must be BLANK, not 0**, for a holding owned before the year. An
 *    explicit zero trips the "must be a whole number of twelfths" validation.
 *
 * Precision follows ELSTER: per-unit intermediates at 4 dp, prices and the
 * per-fund total at 2 dp. Values are returned as strings so nothing is
 * re-rounded downstream.
 */
import Decimal from "decimal.js";

import type { FundSubtype } from "@/lib/analytics/sector-map";

export type VorabpauschaleScheduleInput = {
  isin: string;
  fundName: string;
  /** German fund class driving the Teilfreistellung (line 32). */
  fundType: FundSubtype;
  /** First price/redemption value of the holding year, per unit (line 33). */
  firstPriceEur: number;
  /** Last price/redemption value of the holding year, per unit (line 35). */
  lastPriceEur: number;
  /** Distributions per unit during the holding year (lines 37 + 40). */
  distributionsPerUnitEur: number;
  /** BMF Basiszins for the holding year, in percent (e.g. 2.29 for 2024). */
  basiszinsPct: number;
  /** Units held (line 44). */
  units: number;
  /** Holding (economic) year. Deemed receipt is holdingYear + 1. */
  holdingYear: number;
  /** Acquisition date, when bought DURING the holding year. Omit for a holding
   *  owned before the year — line 42 then stays blank. */
  acquiredAt?: string;
};

export type VorabpauschaleSchedule = {
  line30_isin: string;
  line31_fund: string;
  line32_fundType: FundSubtype;
  line33_firstPrice: string;
  line34_basisAmount: string;
  line35_lastPrice: string;
  /** MUST equal line 33 — the opening price, never the delta. */
  line36_firstPrice: string;
  line37_distributions: string;
  line38_excess: string;
  line39_lower: string;
  line40_distributions: string;
  line41_difference: string;
  /** `null` = submit BLANK (pre-year holding). Never write 0. */
  line42_acquisitionReduction: string | null;
  line43_vapPerUnit: string;
  line44_units: string;
  line45_vapTotal: string;
  /** Full months preceding the acquisition month; 0 for a pre-year holding. */
  fullMonthsBeforeAcquisition: number;
  /** §18 Abs. 3 — the tax year this belongs in. */
  deemedReceiptYear: number;
};

const STATUTORY_FACTOR = "0.7";
const PER_UNIT_DP = 4;
const MONEY_DP = 2;

/** Full months of the holding year that precede the acquisition month. */
function fullMonthsBefore(acquiredAt: string | undefined, holdingYear: number): number {
  if (!acquiredAt) return 0;
  const d = new Date(acquiredAt);
  if (Number.isNaN(d.getTime())) return 0;
  if (d.getFullYear() !== holdingYear) return 0; // owned before (or after) the year
  return d.getMonth(); // Jan → 0, Mar → 2
}

export function buildVorabpauschaleSchedule(
  input: VorabpauschaleScheduleInput,
): VorabpauschaleSchedule {
  const first = new Decimal(input.firstPriceEur);
  const last = new Decimal(input.lastPriceEur);
  const dist = new Decimal(input.distributionsPerUnitEur);
  const units = new Decimal(input.units);
  const zero = new Decimal(0);

  const negativeBasiszins = input.basiszinsPct <= 0;

  // Line 34 — Basisertrag per unit = opening price × Basiszins × 70 %.
  const basisAmount = negativeBasiszins
    ? zero
    : first.mul(input.basiszinsPct).div(100).mul(STATUTORY_FACTOR);

  // Line 38 — Mehrbetrag per unit = closing − opening + distributions.
  const excess = last.minus(first).plus(dist);

  // Line 39 — the lower of the Basisertrag and the actual excess, floored at 0
  // (a fund that lost value yields no Vorabpauschale).
  const lower = Decimal.max(0, Decimal.min(basisAmount, excess));

  // Line 41 — distributions already taxed reduce the lump sum.
  const difference = Decimal.max(0, lower.minus(dist));

  // Line 42 — 1/12 per full month before acquisition; BLANK for a pre-year lot.
  const months = fullMonthsBefore(input.acquiredAt, input.holdingYear);
  const reduction = months > 0 ? difference.mul(months).div(12) : null;

  const perUnit = reduction ? difference.minus(reduction) : difference;
  const total = perUnit.mul(units);

  return {
    line30_isin: input.isin,
    line31_fund: input.fundName,
    line32_fundType: input.fundType,
    line33_firstPrice: first.toFixed(MONEY_DP),
    line34_basisAmount: basisAmount.toFixed(PER_UNIT_DP),
    line35_lastPrice: last.toFixed(MONEY_DP),
    line36_firstPrice: first.toFixed(MONEY_DP), // repeat of line 33 — NOT the delta
    line37_distributions: dist.toFixed(MONEY_DP),
    line38_excess: excess.toFixed(MONEY_DP),
    line39_lower: lower.toFixed(PER_UNIT_DP),
    line40_distributions: dist.toFixed(MONEY_DP),
    line41_difference: difference.toFixed(PER_UNIT_DP),
    line42_acquisitionReduction: reduction ? reduction.toFixed(PER_UNIT_DP) : null,
    line43_vapPerUnit: perUnit.toFixed(PER_UNIT_DP),
    line44_units: units.toString(),
    line45_vapTotal: total.toFixed(MONEY_DP),
    fullMonthsBeforeAcquisition: months,
    deemedReceiptYear: input.holdingYear + 1,
  };
}
