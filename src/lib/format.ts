/**
 * Shared number/currency formatters. Previously duplicated as inline
 * `fmtEur`/`fmtPct`/`fmtNative` helpers inside every page accessor and
 * component — that's how subtle drift happened (sometimes 2 decimals,
 * sometimes 0; sometimes `+` prefix on positives, sometimes not).
 *
 * Single source of truth. Use these everywhere.
 */

const CCY_SYMBOL: Record<string, string> = {
  EUR: "€",
  USD: "$",
  GBP: "£",
  CHF: "₣",
  JPY: "¥",
  SEK: "kr",
  HKD: "HK$",
  CAD: "C$",
};

export type FmtEurOptions = {
  /** Prepend `+` on non-negative values. */
  sign?: boolean;
  /** Min/max decimals (defaults to 2). */
  dec?: number;
  /** Omit the currency symbol; just return the formatted number. */
  noSymbol?: boolean;
};

export function fmtEur(value: number, opts: FmtEurOptions = {}): string {
  const { sign = false, dec = 2, noSymbol = false } = opts;
  const abs = Math.abs(value).toLocaleString("de-DE", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
  const symbol = noSymbol ? "" : "€";
  // `−` is the Unicode minus (U+2212) — visually balanced with `+`.
  if (sign) {
    if (value >= 0) return `+${symbol}${abs}`;
    return `−${symbol}${abs}`;
  }
  return value < 0 ? `−${symbol}${abs}` : `${symbol}${abs}`;
}

export function fmtPct(value: number | null, dec = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(dec)}%`;
}

export function fmtNative(value: number | null, ccy: string | null, opts: { sign?: boolean; dec?: number } = {}): string {
  if (value === null || !ccy) return "—";
  const { sign = false, dec = 2 } = opts;
  const symbol = CCY_SYMBOL[ccy] ?? "";
  const abs = Math.abs(value).toLocaleString("de-DE", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
  const body = symbol ? `${symbol}${abs}` : `${abs} ${ccy}`;
  if (!sign) return value < 0 ? `−${body}` : body;
  return value >= 0 ? `+${body}` : `−${body}`;
}

export function fmtQty(value: number, dec = 8): string {
  // Strip trailing zeros so "0.05000000" → "0.05" without losing precision
  // on values with real decimals like "0.00404612".
  const fixed = value.toFixed(dec);
  return fixed.replace(/\.?0+$/, "") || "0";
}

export function fmtDate(iso: string): string {
  return iso.slice(0, 10);
}
