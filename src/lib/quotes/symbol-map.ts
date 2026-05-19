const OVERRIDES: Record<string, string> = {
  "BRK B": "BRK-B",
  "XSX7": "XSX7.DE",
  "VUSA": "VUSA.AS",
  "VHYL": "VHYL.AS",
  "SPYW": "SPYW.DE",
  // Renamed tickers — IBKR aliases are canonicalized to these by the parser
  "EVO": "EVO.ST",   // EVOLUTION AB on Stockholm
  "TRN": "TRN.L",    // TRAINLINE PLC on LSE
};

export function toYahooSymbol(internal: string): string {
  return OVERRIDES[internal] ?? internal;
}
