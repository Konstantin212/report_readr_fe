const OVERRIDES: Record<string, string> = {
  "BRK B": "BRK-B",
  "XSX7": "XSX7.DE",
  "VUSA": "VUSA.AS",
  "VHYL": "VHYL.AS",
  "SPYW": "SPYW.DE",
  // Renamed tickers — IBKR aliases are canonicalized to these by the parser
  "EVO": "EVO.ST",   // EVOLUTION AB on Stockholm
  "TRN": "TRN.L",    // TRAINLINE PLC on LSE
  // Amsterdam-listed UCITS ETFs Stooq doesn't carry — Yahoo does.
  "IEMM": "IEMM.AS", // iShares MSCI EM UCITS (Amsterdam EUR class)
};

export function toYahooSymbol(internal: string): string {
  return OVERRIDES[internal] ?? internal;
}

/**
 * Twelve Data uses `SYMBOL:EXCHANGE` instead of Yahoo's `SYMBOL.suffix`.
 *
 * For US tickers TD picks the listing automatically when you send just
 * the bare symbol, so no override is needed. The dangerous case is
 * collision tickers — `TRN` alone returns Trinity Industries on NYSE,
 * not Trainline on LSE — so we ALWAYS qualify European tickers with
 * an exchange to avoid silently writing the wrong company's price into
 * our cache.
 *
 * Exchange names taken verbatim from TD's /symbol_search response.
 */
const TD_OVERRIDES: Record<string, string> = {
  // LSE (London Stock Exchange)
  "TRN":  "TRN:LSE",     // CRITICAL — bare TRN = Trinity Industries (NYSE)
  // XETR (Xetra, Frankfurt) — only listed in Germany, but qualify anyway
  // to keep the rule "international = always specify exchange" simple.
  "XSX7": "XSX7:XETR",
  "SPYW": "SPYW:XETR",
  "RY4C": "RY4C:XETR",   // Freedom24's alias for Ryanair Holdings on Xetra
  // Euronext (Amsterdam) — UCITS ETFs the user holds via the AS listing.
  "VHYL": "VHYL:Euronext",
  "VUSA": "VUSA:Euronext",
  "IEMM": "IEMM:Euronext",
  // Stockholm
  "EVO":  "EVO:OMXSTO",  // EVOLUTION AB
};

export function toTwelveDataSymbol(internal: string): string {
  return TD_OVERRIDES[internal] ?? internal;
}
