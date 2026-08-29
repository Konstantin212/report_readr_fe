/**
 * Shared number/currency formatters. Previously duplicated as inline
 * `fmtEur`/`fmtPct`/`fmtNative` helpers inside every page accessor and
 * component — that's how subtle drift happened (sometimes 2 decimals,
 * sometimes 0; sometimes `+` prefix on positives, sometimes not).
 *
 * Single source of truth. Use these everywhere.
 *
 * Two families, and picking the wrong one loses information:
 *   - `fmtEur` / `fmtNative` / `fmtPct` keep the `−` on negatives. Use for
 *     balances, costs, proceeds, loss pots — anything the UI does NOT
 *     colour by direction.
 *   - `fmtPl` / `fmtPlNative` return a bare magnitude. Use for profit/loss,
 *     where direction is carried by colour instead of a sign.
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
  /** Min/max decimals (defaults to 2). */
  dec?: number;
  /** Omit the currency symbol; just return the formatted number. */
  noSymbol?: boolean;
};

function magnitude(value: number, dec: number): string {
  return Math.abs(value).toLocaleString("de-DE", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

export function fmtEur(value: number, opts: FmtEurOptions = {}): string {
  const { dec = 2, noSymbol = false } = opts;
  const symbol = noSymbol ? "" : "€";
  // `−` is the Unicode minus (U+2212) — visually balanced with the digits.
  return value < 0 ? `−${symbol}${magnitude(value, dec)}` : `${symbol}${magnitude(value, dec)}`;
}

/**
 * Profit/loss amount as a bare magnitude — no `+`, no `−`.
 *
 * The widgets that show P/L are narrow, and the sign was eating a character
 * of horizontal space that the number needed. Gains and losses are told
 * apart by colour instead: `text-mint` for a gain, `text-bad` for a loss.
 *
 * CONTRACT: only render this inside an element carrying that colour.
 * Without it a loss is indistinguishable from a gain — reach for `fmtEur`,
 * which keeps the minus, whenever the surrounding element isn't coloured.
 */
export function fmtPl(value: number, opts: FmtEurOptions = {}): string {
  const { dec = 2, noSymbol = false } = opts;
  return `${noSymbol ? "" : "€"}${magnitude(value, dec)}`;
}

/**
 * Percentage magnitude. Returns/changes are always colour-coded where they
 * appear, so this drops the sign for the same reason `fmtPl` does.
 */
export function fmtPct(value: number | null, dec = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${Math.abs(value).toFixed(dec)}%`;
}

export function fmtNative(value: number | null, ccy: string | null, opts: { dec?: number } = {}): string {
  if (value === null || !ccy) return "—";
  const { dec = 2 } = opts;
  const body = nativeBody(value, ccy, dec);
  return value < 0 ? `−${body}` : body;
}

/** Foreign-currency counterpart of `fmtPl` — same colour contract applies. */
export function fmtPlNative(value: number | null, ccy: string | null, opts: { dec?: number } = {}): string {
  if (value === null || !ccy) return "—";
  return nativeBody(value, ccy, opts.dec ?? 2);
}

function nativeBody(value: number, ccy: string, dec: number): string {
  const symbol = CCY_SYMBOL[ccy] ?? "";
  const abs = magnitude(value, dec);
  return symbol ? `${symbol}${abs}` : `${abs} ${ccy}`;
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
