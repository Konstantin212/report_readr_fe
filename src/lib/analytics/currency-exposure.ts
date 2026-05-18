import Decimal from "decimal.js";

export type CurrencyExposure = {
  code: string;
  pct: number;
  valueEur: number;
  flag?: string;
};

const FLAGS: Record<string, string> = {
  USD: "🇺🇸",
  EUR: "🇪🇺",
  GBP: "🇬🇧",
  HKD: "🇭🇰",
  CHF: "🇨🇭",
  JPY: "🇯🇵",
};

export function computeCurrencyExposure(
  positions: { currency: string; marketEur: number | null }[],
): CurrencyExposure[] {
  const totals = new Map<string, Decimal>();

  for (const p of positions) {
    if (p.marketEur === null) continue;
    const prev = totals.get(p.currency) ?? new Decimal(0);
    totals.set(p.currency, prev.plus(p.marketEur));
  }

  if (totals.size === 0) return [];

  const grandTotal = [...totals.values()].reduce((a, b) => a.plus(b), new Decimal(0));

  const result: CurrencyExposure[] = [];
  for (const [code, value] of totals) {
    const pct = grandTotal.isZero()
      ? 0
      : value.div(grandTotal).mul(100).toDecimalPlaces(1).toNumber();
    const entry: CurrencyExposure = { code, pct, valueEur: value.toNumber() };
    if (FLAGS[code]) entry.flag = FLAGS[code];
    result.push(entry);
  }

  return result.sort((a, b) => b.valueEur - a.valueEur);
}
