export type FirstRunSignal = {
  /** Statements ever ingested — `getImportCount`. */
  importCount: number;
  /** At least one Coinbase key connected — `getCryptoSummary().hasAccounts`. */
  hasCryptoAccounts: boolean;
};

/**
 * AC-OC3.1 — first run means the account has no data at all from EITHER
 * ingest path. A Coinbase-only user has zero imports but real positions and
 * must NOT see the first-run card (AC-OC3.6).
 */
export function isFirstRun(signal: FirstRunSignal): boolean {
  return signal.importCount === 0 && !signal.hasCryptoAccounts;
}
