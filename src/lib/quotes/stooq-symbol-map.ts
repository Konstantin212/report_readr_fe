/**
 * Map an internal canonical ticker (post-IBKR-FII-resolution) to its Stooq
 * symbol. Stooq uses `<ticker>.<exchange>` with lowercase suffixes:
 *   .us  — US exchanges (NYSE/NASDAQ)
 *   .uk  — LSE
 *   .de  — Xetra
 *   .nl  — Euronext Amsterdam
 *   .fr  — Euronext Paris
 *   .se  — Stockholm
 *
 * The map is hand-maintained per ticker. Symbols not in OVERRIDES default to
 * `<lower>.us` which covers the majority of US-listed stocks.
 */
const OVERRIDES: Record<string, string> = {
  // US tickers handled by default <symbol>.us, but explicit for clarity:
  BLBD: "blbd.us",
  COIN: "coin.us",
  TSM: "tsm.us",
  SONY: "sony.us",
  GOOGL: "googl.us",
  GOOG: "goog.us",
  AAPL: "aapl.us",
  MSFT: "msft.us",
  NVDA: "nvda.us",
  JPM: "jpm.us",
  XOM: "xom.us",
  LLY: "lly.us",
  CRCL: "crcl.us",
  // LSE
  TRN: "trn.uk",
  VHYL: "vhyl.uk",
  VUSA: "vusa.uk",
  // Xetra / Frankfurt
  SPYW: "spyw.de",
  XSX7: "xsx7.de",
  // iShares MSCI EM UCITS — held as IEMM on Euronext Amsterdam (EUR), but
  // Stooq only carries the LSE twin under EIMI (GBP). Same ISIN
  // (IE00B0M63177); GBP→EUR is handled by the positions accessor.
  IEMM: "eimi.uk",
  // Stockholm
  EVO: "evo.se",
  // Benchmarks
  "^GSPC": "^spx",
  "^IXIC": "^ndq",
  "^DJI": "^dji",
};

export function toStooqSymbol(internal: string): string {
  if (OVERRIDES[internal]) return OVERRIDES[internal];
  // Default: assume US listing
  if (internal.startsWith("^")) return internal.toLowerCase();
  return `${internal.toLowerCase()}.us`;
}
