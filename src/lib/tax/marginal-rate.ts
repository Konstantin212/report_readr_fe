/**
 * German income-tax tariff (§32a EStG) — marginal-rate estimate, used ONLY
 * to personalize the Anlage KAP Zeile 4 "Günstigerprüfung" recommendation:
 * requesting it is worthwhile iff the personal marginal rate is BELOW the
 * 25 % Abgeltungsteuer.
 *
 * Coefficients are the 2025 tariff (Grundfreibetrag €12,096; 42 % from
 * €68,481; 45 % from €277,826). The progression-zone coefficients shift
 * slightly each year, but the only thing consumed downstream is the "is the
 * marginal rate under 25 %?" threshold (~€20.5k single / ~€41k joint zvE),
 * which is robust to those shifts. Joint filers use the Splitting method:
 * the marginal rate at half the joint income.
 */

const GRUNDFREIBETRAG = 12_096;
const ZONE1_END = 17_443; // ~14 % → ~24 %
const ZONE2_END = 68_480; // ~24 % → 42 %
const RICH_START = 277_826; // 45 %

// 2025 progression coefficients (ESt formula: (a·y + b)·y [+ c]).
const ZONE1_A = 954.8;
const ZONE1_B = 1_400;
const ZONE2_A = 181.19;
const ZONE2_B = 2_397;

/**
 * Marginal income-tax rate (percent, excl. Soli/Kirchensteuer) at the given
 * taxable income. `filingStatus` JOINT applies Splitting (rate at zvE/2).
 */
export function marginalRatePct(taxableIncomeEur: number, filingStatus: "SINGLE" | "JOINT" = "SINGLE"): number {
  const zvE = filingStatus === "JOINT" ? taxableIncomeEur / 2 : taxableIncomeEur;
  if (!Number.isFinite(zvE) || zvE <= GRUNDFREIBETRAG) return 0;
  if (zvE <= ZONE1_END) {
    const y = (zvE - GRUNDFREIBETRAG) / 10_000;
    return (2 * ZONE1_A * y + ZONE1_B) / 100;
  }
  if (zvE <= ZONE2_END) {
    const z = (zvE - ZONE1_END) / 10_000;
    return (2 * ZONE2_A * z + ZONE2_B) / 100;
  }
  if (zvE < RICH_START) return 42;
  return 45;
}

/**
 * Should the filer request the Günstigerprüfung (KAP Zeile 4)?
 * Only when their marginal rate is below the 25 % flat Abgeltungsteuer —
 * then taxing capital income at personal rates is cheaper. Unknown income
 * ⇒ false (the conservative default; the UI explains how to personalize).
 */
export function guenstigerpruefungRecommended(
  taxableIncomeEur: number | null | undefined,
  filingStatus: "SINGLE" | "JOINT" = "SINGLE",
): boolean {
  if (taxableIncomeEur == null || !Number.isFinite(taxableIncomeEur) || taxableIncomeEur <= 0) return false;
  return marginalRatePct(taxableIncomeEur, filingStatus) < 25;
}
