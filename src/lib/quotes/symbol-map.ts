const OVERRIDES: Record<string, string> = {
  "BRK B": "BRK-B",
  "XSX7": "XSX7.DE",
  "VUSA": "VUSA.AS",
  "VHYL": "VHYL.AS",
  "SPYW": "SPYW.DE",
};

export function toYahooSymbol(internal: string): string {
  return OVERRIDES[internal] ?? internal;
}
