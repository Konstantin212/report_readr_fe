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
  ARKK: "ETF", IVV: "ETF", SCHD: "ETF",
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
  // ETFs we know are ETFs but whose KAP-INV subtype hasn't been verified
  // yet — they'll get classified as "etf" here but fundSubtype() returns
  // "unknown", which routes them to Z8_sonstige + a warning so the user
  // double-checks with their Steuerberater.
  EUNL: "etf", // iShares Core MSCI World — almost certainly aktien, awaiting verification
  // Schwab US Dividend Equity ETF — FF statements type it фонд/ETF; hardcoded
  // fallback for rows ingested before instruments.kind existed.
  SCHD: "etf",
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

/**
 * German Anlage KAP-INV fund subtype — drives WHICH line a fund's
 * distribution/sale lands on (Z4 Aktienfonds, Z5 Mischfonds, etc.).
 *
 * Kept SEPARATE from `classifyKind` because the other call sites
 * (positions, loss-harvest, bucket isolation) don't care about the
 * sub-taxonomy — only the tax pipeline does. Adding it to classifyKind
 * would force every consumer to deal with a refinement they don't need.
 *
 * "unknown" → builder routes to Z8_sonstige (0% Teilfreistellung — the
 * safe, higher-tax default) and emits a warning so the user verifies.
 */
export type FundSubtype = "aktien" | "misch" | "immo_inland" | "immo_ausland" | "sonstige";

const FUND_SUBTYPE_MAP: Record<string, FundSubtype> = {
  // Equity funds (Aktienfonds) — distributing or accumulating, >50% stocks.
  // Triggers 30% Teilfreistellung in ELSTER.
  SPYW: "aktien", VUSA: "aktien", VHYL: "aktien", XSX7: "aktien",
  EUDI: "aktien",   // delisted alias for SPYW
  VUAA: "aktien",   // S&P 500 accumulating
  IEMM: "aktien",   // iShares MSCI EM
  IWDA: "aktien",   // iShares Core MSCI World
  VOO:  "aktien", VTI: "aktien", QQQ: "aktien", SPY: "aktien",
  ARKK: "aktien", IVV: "aktien",
  // US equity-index ETFs (T1). justETF is EU-only and returns NOT_FOUND for
  // these, so enrichment can fix `kind` (→ etf via Yahoo) but never supplies
  // a Teilfreistellung subtype. A broad US equity-index fund holds ≥ 51 %
  // Aktien, so it is an Aktienfonds ⇒ 30 % Teilfreistellung (§ 2 Abs. 6
  // InvStG). SCHD (Schwab US Dividend Equity) joins SPY/VOO already above.
  SCHD: "aktien",
};

export function fundSubtype(symbol: string): FundSubtype | "unknown" {
  return FUND_SUBTYPE_MAP[symbol] ?? "unknown";
}
