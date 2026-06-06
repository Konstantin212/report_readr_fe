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
 * Twelve Data needs the exchange as a *separate* query parameter on
 * /quote (`?symbol=TRN&exchange=LSE`), not embedded in the symbol.
 *
 * For US tickers TD picks the listing automatically when you send just
 * the bare symbol, so no override is needed. The dangerous case is
 * collision tickers — `TRN` alone returns Trinity Industries on NYSE,
 * not Trainline on LSE — so we ALWAYS qualify European tickers with
 * an exchange to avoid silently writing the wrong company's price into
 * our cache.
 *
 * Exchange values taken verbatim from TD's /symbol_search responses.
 */
const TD_OVERRIDES: Record<string, { symbol: string; exchange: string }> = {
  // LSE (London Stock Exchange)
  "TRN":  { symbol: "TRN",  exchange: "LSE" },     // CRITICAL — bare TRN = Trinity Industries (NYSE)
  // XETR (Xetra, Frankfurt)
  "XSX7": { symbol: "XSX7", exchange: "XETR" },
  "SPYW": { symbol: "SPYW", exchange: "XETR" },
  "RY4C": { symbol: "RY4C", exchange: "XETR" },    // Freedom24's alias for Ryanair Holdings on Xetra
  // Euronext (Amsterdam) — UCITS ETFs the user holds via the AS listing.
  "VHYL": { symbol: "VHYL", exchange: "Euronext" },
  "VUSA": { symbol: "VUSA", exchange: "Euronext" },
  "IEMM": { symbol: "IEMM", exchange: "Euronext" },
  // Stockholm
  "EVO":  { symbol: "EVO",  exchange: "OMXSTO" },  // EVOLUTION AB
};

export type TwelveDataSymbol = { symbol: string; exchange?: string };

export function toTwelveDataSymbol(internal: string): TwelveDataSymbol {
  const o = TD_OVERRIDES[internal];
  if (o) return { symbol: o.symbol, exchange: o.exchange };
  return { symbol: internal };
}
