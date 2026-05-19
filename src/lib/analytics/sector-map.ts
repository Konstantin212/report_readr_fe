export const SECTOR_MAP: Record<string, string> = {
  // Tech
  NVDA: "Tech", AAPL: "Tech", MSFT: "Tech", GOOG: "Tech", GOOGL: "Tech",
  META: "Tech", ASML: "Tech", AMD: "Tech", TSM: "Tech", "0700": "Tech",
  CRM: "Tech", ORCL: "Tech", ADBE: "Tech", NFLX: "Tech",
  // Financials
  "BRK-B": "Financials",
  JPM: "Financials", BAC: "Financials", GS: "Financials", BNP: "Financials",
  V: "Financials", MA: "Financials",
  // Healthcare
  LLY: "Healthcare", "NOVO-B": "Healthcare", JNJ: "Healthcare", PFE: "Healthcare",
  UNH: "Healthcare", ABBV: "Healthcare",
  // Consumer
  NESN: "Consumer", COST: "Consumer", PG: "Consumer", KO: "Consumer",
  WMT: "Consumer", MCD: "Consumer", TSLA: "Consumer",
  BMW: "Consumer", VOW3: "Consumer", VOW: "Consumer",
  // Energy
  XOM: "Energy", SHEL: "Energy", CVX: "Energy", BP: "Energy",
  // Industrials
  GE: "Industrials", RHM: "Industrials", BA: "Industrials", CAT: "Industrials",
  // ETF
  SPYW: "ETF", VUSA: "ETF", VHYL: "ETF", XSX7: "ETF",
  EUDI: "ETF",
  VOO: "ETF", VTI: "ETF", QQQ: "ETF", SPY: "ETF",
  ARKK: "ETF", IVV: "ETF",
};

export const DEFAULT_SECTOR = "Other";

export function classifySector(symbol: string): string {
  return SECTOR_MAP[symbol] ?? DEFAULT_SECTOR;
}

export type AssetKind = "stock" | "etf" | "bond" | "other";

// Explicit kind overrides for symbols that aren't obviously a stock.
// Most equity tickers default to "stock"; this map handles ETFs / bonds / unusual cases.
export const KIND_MAP: Record<string, AssetKind> = {
  // ETFs (also tagged "ETF" in SECTOR_MAP)
  SPYW: "etf", VUSA: "etf", VHYL: "etf", XSX7: "etf",
  EUDI: "etf", // delisted alias for SPYW
  VOO: "etf", VTI: "etf", QQQ: "etf", SPY: "etf",
  ARKK: "etf", IVV: "etf",
};

/**
 * Classify an asset's kind from symbol + sector + a free-form "raw symbol" string.
 * Order of precedence:
 *   1. Explicit override in KIND_MAP
 *   2. Sector tag = "ETF" (from sector-map)
 *   3. Bond patterns in the symbol string (digits + percentage, slash-fraction, "Treasury")
 *   4. Default: "stock"
 *
 * `rawSymbol` is what was in the broker statement before normalization; useful for
 * bonds which the parser strips a yield suffix from, but the raw symbol still has it.
 */
export function classifyKind(symbol: string, sector?: string, rawSymbol?: string): AssetKind {
  if (KIND_MAP[symbol]) return KIND_MAP[symbol];
  if (sector === "ETF") return "etf";

  const candidates = [symbol, rawSymbol].filter(Boolean) as string[];
  for (const s of candidates) {
    // Treasury bonds: e.g. "T 4 5/8 09/15/26" or with trailing % yield
    if (/^T\s+\d+\s+\d+\/\d+\s+\d{2}\/\d{2}\/\d{2,4}/.test(s)) return "bond";
    // Corporate bonds: e.g. "C Float 06/09/27"
    if (/\bFloat\b/.test(s) && /\d{2}\/\d{2}\/\d{2,4}/.test(s)) return "bond";
    // Generic: contains "Bond" or "Note" + maturity date
    if (/\b(Bond|Note)\b/i.test(s) && /\d{2}\/\d{2}\/\d{2,4}/.test(s)) return "bond";
  }

  return "stock";
}
