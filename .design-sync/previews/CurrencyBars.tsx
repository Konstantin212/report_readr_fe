import { CurrencyBars } from "report-readr-fe";
import { Frame } from "./_frame";

/**
 * Typical multi-currency exposure across a diversified position book —
 * three brokers (IBKR, FF, Revolut) pull in EUR, USD, GBP, CHF.
 */
export function Default() {
  const data = [
    { code: "EUR", pct: 44.2, flag: "🇪🇺" },
    { code: "USD", pct: 31.6, flag: "🇺🇸" },
    { code: "GBP", pct: 15.4, flag: "🇬🇧" },
    { code: "CHF", pct: 8.8, flag: "🇨🇭" },
  ];
  return (
    <Frame className="max-w-sm">
      <CurrencyBars data={data} />
    </Frame>
  );
}

/** Home-currency dominant — most of the book already sits in EUR. */
export function EurHeavy() {
  const data = [
    { code: "EUR", pct: 82.1, flag: "🇪🇺" },
    { code: "USD", pct: 12.3, flag: "🇺🇸" },
    { code: "GBP", pct: 5.6, flag: "🇬🇧" },
  ];
  return (
    <Frame className="max-w-sm">
      <CurrencyBars data={data} />
    </Frame>
  );
}

/** Many small currency slivers — a broadly diversified global ETF sleeve. */
export function ManyCurrencies() {
  const data = [
    { code: "USD", pct: 38.4, flag: "🇺🇸" },
    { code: "EUR", pct: 24.7, flag: "🇪🇺" },
    { code: "GBP", pct: 14.1, flag: "🇬🇧" },
    { code: "CHF", pct: 9.9, flag: "🇨🇭" },
    { code: "JPY", pct: 7.2, flag: "🇯🇵" },
    { code: "SEK", pct: 5.7, flag: "🇸🇪" },
  ];
  return (
    <Frame className="max-w-sm">
      <CurrencyBars data={data} />
    </Frame>
  );
}

/** Single currency — a fresh account that has only ever held EUR. */
export function SingleCurrency() {
  const data = [{ code: "EUR", pct: 100, flag: "🇪🇺" }];
  return (
    <Frame className="max-w-sm">
      <CurrencyBars data={data} />
    </Frame>
  );
}
