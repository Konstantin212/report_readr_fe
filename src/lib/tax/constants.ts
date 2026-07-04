/**
 * German capital-income tax constants, in one place so a statutory change
 * (e.g. the Soli or the Sparer-Pauschbetrag) is a single edit rather than a
 * hunt across loaders, forecasts, and the loss-harvest page.
 */

/**
 * Abgeltungsteuer effective rate: 25 % flat tax + 5.5 % Solidaritätszuschlag
 * on that tax = 0.25 × 1.055 = 0.26375. (Church tax, where applicable, is
 * not modelled.)
 */
export const ABGELT_RATE = 0.26375;

/**
 * Sparer-Pauschbetrag default for a single filer (€1000 since 2023; €2000
 * for jointly-assessed couples, which the user sets explicitly). Stored as a
 * string to match the numeric-as-text convention used across tax settings.
 */
export const SAVER_ALLOWANCE_DEFAULT = "1000";
