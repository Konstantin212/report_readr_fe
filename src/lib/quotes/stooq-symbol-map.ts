/**
 * Map an internal canonical ticker (post-IBKR-FII-resolution) to its Stooq
 * symbol + a price scale.
 *
 * Stooq uses `<ticker>.<exchange>` with lowercase suffixes:
 *   .us  — US exchanges (NYSE/NASDAQ)
 *   .uk  — LSE
 *   .de  — Xetra
 *   .nl  — Euronext Amsterdam
 *   .fr  — Euronext Paris
 *   .se  — Stockholm
 *
 * Scaling: LSE ordinary shares quote in **pence** (GBp), so Stooq's `.uk`
 * close for an ordinary share is 100× the actual GBP price (e.g. TRN 217.8
 * means £2.178). UK-listed UCITS ETFs (VHYL, VUSA, EIMI, …) quote in their
 * fund currency at unit scale, so no division. We mark pence-quoted tickers
 * explicitly with `scale: 0.01`; everything else defaults to scale 1.
 *
 * The map is hand-maintained per ticker. Symbols not in OVERRIDES default to
 * `<lower>.us` which covers the majority of US-listed stocks.
 */
export type StooqMapping = { stooq: string; scale: number };

const OVERRIDES: Record<string, StooqMapping> = {
  // US — scale 1
  BLBD:  { stooq: "blbd.us",  scale: 1 },
  COIN:  { stooq: "coin.us",  scale: 1 },
  TSM:   { stooq: "tsm.us",   scale: 1 },
  SONY:  { stooq: "sony.us",  scale: 1 },
  GOOGL: { stooq: "googl.us", scale: 1 },
  GOOG:  { stooq: "goog.us",  scale: 1 },
  AAPL:  { stooq: "aapl.us",  scale: 1 },
  MSFT:  { stooq: "msft.us",  scale: 1 },
  NVDA:  { stooq: "nvda.us",  scale: 1 },
  JPM:   { stooq: "jpm.us",   scale: 1 },
  XOM:   { stooq: "xom.us",   scale: 1 },
  LLY:   { stooq: "lly.us",   scale: 1 },
  CRCL:  { stooq: "crcl.us",  scale: 1 },
  // LSE ordinary shares — Stooq returns pence; divide by 100
  TRN:   { stooq: "trn.uk",   scale: 0.01 },
  // LSE UCITS ETFs — Stooq returns fund currency at unit scale
  VHYL:  { stooq: "vhyl.uk",  scale: 1 },
  VUSA:  { stooq: "vusa.uk",  scale: 1 },
  // iShares MSCI EM UCITS — held as IEMM on Euronext Amsterdam (no Stooq
  // coverage); we re-route to its LSE twin EIMI (same ISIN IE00B0M63177).
  // EIMI is the GBP UCITS ETF class — quoted in GBP at unit scale.
  IEMM:  { stooq: "eimi.uk",  scale: 1 },
  // Xetra UCITS ETFs — quoted in EUR at unit scale
  SPYW:  { stooq: "spyw.de",  scale: 1 },
  XSX7:  { stooq: "xsx7.de",  scale: 1 },
  // Ryanair Frankfurt listing — Freedom24 uses "RY4C" as the internal
  // ticker for the EUR-denominated Frankfurt-listed Ryanair share. Stooq
  // carries it under ry4c.de in EUR at unit scale.
  RY4C:  { stooq: "ry4c.de",  scale: 1 },
  // Stockholm — no Stooq coverage today, kept for completeness
  EVO:   { stooq: "evo.se",   scale: 1 },
  // Benchmarks
  "^GSPC": { stooq: "^spx", scale: 1 },
  "^IXIC": { stooq: "^ndq", scale: 1 },
  "^DJI":  { stooq: "^dji", scale: 1 },
};

export function toStooqSymbol(internal: string): string {
  return resolveStooq(internal).stooq;
}

export function resolveStooq(internal: string): StooqMapping {
  const hit = OVERRIDES[internal];
  if (hit) return hit;
  if (internal.startsWith("^")) return { stooq: internal.toLowerCase(), scale: 1 };
  return { stooq: `${internal.toLowerCase()}.us`, scale: 1 };
}
