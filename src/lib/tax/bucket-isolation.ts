/**
 * §20 Abs. 6 EStG loss-bucket isolation.
 *
 * German tax law (since 2009) splits capital income into two buckets that
 * cannot offset each other:
 *  - "Aktien" — gains/losses from individual stocks (Einzelaktien)
 *  - "Sonstige" — everything else (ETFs, bonds, dividends, interest)
 *
 * Each bucket's net is independently floored at zero before the
 * Sparer-Pauschbetrag is applied to the combined total. So a small stock
 * loss CANNOT pull the dividend bucket below the allowance.
 *
 * This helper is used by both the main tax dashboard (`getTaxData`) and
 * the loss-harvest sub-page to make sure their forecasts line up — they
 * used to drift by the size of any waste-bucket loss.
 */

export type BucketIsolationInputs = {
  aktienRealisedNetEur: number;     // signed; can be negative
  sonstigeRealisedNetEur: number;   // signed
  dividendsEur: number;             // positive
  interestEur: number;              // signed (margin debit is negative)
  forecastDividendsEur: number;     // ≥ 0, all to Sonstige
  allowanceEur: number;             // Sparer-Pauschbetrag
};

export type BucketIsolationResult = {
  aktienNetEur: number;             // floored at 0
  sonstigeNetEur: number;           // floored at 0
  combinedNetEur: number;           // aktienNet + sonstigeNet
  taxableBaseEur: number;           // max(0, combined - allowance)
  /** Income consumed against the allowance (clipped). For the progress bar. */
  usedEur: number;
  /** Same shape, including the forecast dividends. Equals taxableBase / used /
   *  net when the forecast input is 0. Separately surfaced so callers don't
   *  have to call this function twice. */
  forecastCombinedNetEur: number;
  forecastTaxableBaseEur: number;
  forecastUsedEur: number;
};

export function applyBucketIsolation(inputs: BucketIsolationInputs): BucketIsolationResult {
  // Sonstige bucket = ETF/bond realised gains + all dividends + all interest.
  // Margin interest is already negative in the input, so it correctly
  // reduces the Sonstige bucket here.
  const sonstigeBaseEur = inputs.sonstigeRealisedNetEur + inputs.dividendsEur + inputs.interestEur;
  const aktienBaseEur = inputs.aktienRealisedNetEur;

  const aktienNetEur = Math.max(0, aktienBaseEur);
  const sonstigeNetEur = Math.max(0, sonstigeBaseEur);
  const combinedNetEur = aktienNetEur + sonstigeNetEur;
  const taxableBaseEur = Math.max(0, combinedNetEur - inputs.allowanceEur);
  const usedEur = Math.max(0, Math.min(combinedNetEur, inputs.allowanceEur));

  // Forecast: projected dividends fall entirely into Sonstige under §20 Abs. 1 Nr. 1.
  const forecastSonstigeEur = Math.max(0, sonstigeBaseEur + inputs.forecastDividendsEur);
  const forecastCombinedNetEur = aktienNetEur + forecastSonstigeEur;
  const forecastTaxableBaseEur = Math.max(0, forecastCombinedNetEur - inputs.allowanceEur);
  const forecastUsedEur = Math.max(0, Math.min(forecastCombinedNetEur, inputs.allowanceEur));

  return {
    aktienNetEur,
    sonstigeNetEur,
    combinedNetEur,
    taxableBaseEur,
    usedEur,
    forecastCombinedNetEur,
    forecastTaxableBaseEur,
    forecastUsedEur,
  };
}
