import { toYahooSymbol } from "./symbol-map";

export type HistoryRow = {
  symbol: string;
  date: string;
  close: string;
  currency: string;
};

type YahooChart = {
  chart: {
    result: Array<{
      meta: { currency: string; symbol: string };
      timestamp: number[];
      indicators: { quote: Array<{ close: Array<number | null> }> };
    }> | null;
    error: { description: string } | null;
  };
};

export async function fetchYahooHistory(symbol: string, range = "2y"): Promise<HistoryRow[]> {
  const mapped = toYahooSymbol(symbol);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(mapped)}?range=${range}&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "portfolio-tax/1.0" }, cache: "no-store" });
  if (!res.ok) throw new Error(`YAHOO_HISTORY_${res.status}_${symbol}`);
  const json = (await res.json()) as YahooChart;
  if (json.chart.error || !json.chart.result?.length) {
    throw new Error(`YAHOO_HISTORY_NO_DATA_${symbol}`);
  }
  const result = json.chart.result[0];
  const { timestamp, indicators, meta } = result;
  const closes = indicators.quote[0].close;
  const out: HistoryRow[] = [];
  for (let i = 0; i < timestamp.length; i++) {
    const close = closes[i];
    if (close === null || close === undefined) continue;
    out.push({
      symbol,
      date: new Date(timestamp[i] * 1000).toISOString().slice(0, 10),
      close: String(close),
      currency: meta.currency,
    });
  }
  return out;
}
