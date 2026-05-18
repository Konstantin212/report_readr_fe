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
};

export const DEFAULT_SECTOR = "Other";

export function classifySector(symbol: string): string {
  return SECTOR_MAP[symbol] ?? DEFAULT_SECTOR;
}
