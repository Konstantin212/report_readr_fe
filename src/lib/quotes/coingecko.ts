/**
 * CoinGecko public REST client. Free tier: 30 calls/minute, no key
 * required. We only use it for historical EUR prices because Coinbase's
 * /v2/prices endpoint is current-only and CDP-key access to /v2/accounts
 * doesn't return native_balance reliably.
 *
 * Symbol → CoinGecko-id mapping is hardcoded for the coins this app is
 * likely to see; unknown symbols return null and the caller falls back
 * gracefully (the equity-curve datapoint is just omitted for that day).
 */

const BASE = "https://api.coingecko.com/api/v3";

/**
 * CoinGecko closed their anonymous endpoints in 2024 — all calls now
 * require a free demo API key. Sign up at coingecko.com/en/api/pricing,
 * pick the "Demo" tier (€0), set COINGECKO_API_KEY in env. Without it
 * every request returns 401 and the equity-curve backfill silently
 * skips (the rest of the app still works).
 */
function authHeaders(): Record<string, string> {
  const key = process.env.COINGECKO_API_KEY;
  return key ? { "x-cg-demo-api-key": key } : {};
}

const SYMBOL_TO_ID: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  ADA: "cardano",
  ATOM: "cosmos",
  MATIC: "matic-network",
  BCH: "bitcoin-cash",
  ETC: "ethereum-classic",
  USDC: "usd-coin",
  USDT: "tether",
  DAI: "dai",
  DOT: "polkadot",
  LINK: "chainlink",
  AVAX: "avalanche-2",
  XRP: "ripple",
  DOGE: "dogecoin",
  LTC: "litecoin",
  XTZ: "tezos",
  FIL: "filecoin",
  ALGO: "algorand",
  NEAR: "near",
  APT: "aptos",
  SUI: "sui",
};

export function coingeckoIdForSymbol(symbol: string): string | null {
  return SYMBOL_TO_ID[symbol.toUpperCase()] ?? null;
}

export type DailyClose = { date: string; priceEur: string };

/**
 * Fetch daily close prices in EUR for `[fromUnix, toUnix]`. CoinGecko's
 * market_chart/range returns intraday points for short windows and daily
 * points for windows ≥ 90 days; we always pull as one call and reduce to
 * one point per UTC date (last observed price wins).
 */
export async function fetchDailyClosesEur(
  symbol: string,
  fromUnixSeconds: number,
  toUnixSeconds: number,
): Promise<DailyClose[]> {
  const id = coingeckoIdForSymbol(symbol);
  if (!id) return [];

  const url = `${BASE}/coins/${id}/market_chart/range?vs_currency=eur&from=${fromUnixSeconds}&to=${toUnixSeconds}`;
  const res = await fetch(url, { headers: { accept: "application/json", ...authHeaders() } });
  if (res.status === 429) {
    throw new Error(`coingecko ${symbol} → 429 rate limited`);
  }
  if (!res.ok) throw new Error(`coingecko ${symbol} → ${res.status}`);

  const body = (await res.json()) as { prices: [number, number][] };
  const byDate = new Map<string, string>();
  for (const [ms, price] of body.prices) {
    const date = new Date(ms).toISOString().slice(0, 10);
    byDate.set(date, String(price));
  }
  return Array.from(byDate.entries()).map(([date, priceEur]) => ({ date, priceEur }));
}

export async function fetchSpotEur(symbol: string): Promise<string | null> {
  const id = coingeckoIdForSymbol(symbol);
  if (!id) return null;
  const res = await fetch(`${BASE}/simple/price?ids=${id}&vs_currencies=eur`, { headers: authHeaders() });
  if (!res.ok) return null;
  const body = (await res.json()) as Record<string, { eur?: number }>;
  const v = body[id]?.eur;
  return v === undefined ? null : String(v);
}
