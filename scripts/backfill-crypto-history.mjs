// Populate crypto_daily_values for every owner with crypto transactions.
// For each unique symbol, fetch daily EUR closes from CoinGecko for the
// span [first_buy_date, today]. Then walk the user's transaction history
// to compute the end-of-day qty per (date, symbol) and persist value.
//
// Idempotent: re-running upserts.
import { neon } from "@neondatabase/serverless";
import Decimal from "decimal.js";

const sql = neon(process.env.DATABASE_URL);

const SYMBOL_TO_ID = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", ADA: "cardano", ATOM: "cosmos",
  MATIC: "matic-network", BCH: "bitcoin-cash", ETC: "ethereum-classic",
  USDC: "usd-coin", USDT: "tether", DAI: "dai", DOT: "polkadot",
  LINK: "chainlink", AVAX: "avalanche-2", XRP: "ripple", DOGE: "dogecoin",
  LTC: "litecoin", XTZ: "tezos", FIL: "filecoin", ALGO: "algorand",
};

async function fetchDailyEur(symbol, fromDate, toDate) {
  const id = SYMBOL_TO_ID[symbol];
  if (!id) return new Map();
  const from = Math.floor(new Date(`${fromDate}T00:00:00Z`).getTime() / 1000);
  const to = Math.floor(new Date(`${toDate}T23:59:59Z`).getTime() / 1000);
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart/range?vs_currency=eur&from=${from}&to=${to}`;
  const headers = process.env.COINGECKO_API_KEY ? { "x-cg-demo-api-key": process.env.COINGECKO_API_KEY } : {};
  const res = await fetch(url, { headers });
  if (!res.ok) {
    console.warn(`  ! coingecko ${symbol} → ${res.status}`);
    return new Map();
  }
  const body = await res.json();
  const byDate = new Map();
  for (const [ms, price] of body.prices ?? []) {
    const date = new Date(ms).toISOString().slice(0, 10);
    byDate.set(date, String(price));
  }
  return byDate;
}

// Group transactions per (owner, symbol) and find date span.
const ownerScopes = await sql`
  select owner_user_id, symbol, min(event_date) as first_date, max(event_date) as last_date
  from transactions
  where broker = 'COINBASE' and symbol is not null
    and event_type in ('CRYPTO_BUY', 'CRYPTO_SELL', 'CRYPTO_STAKE_REWARD')
  group by owner_user_id, symbol
`;

const today = new Date().toISOString().slice(0, 10);

for (const scope of ownerScopes) {
  const sym = scope.symbol;
  console.log(`\n=== ${sym} for ${scope.owner_user_id.slice(0, 8)}… (${scope.first_date} → ${today}) ===`);

  const prices = await fetchDailyEur(sym, scope.first_date, today);
  if (prices.size === 0) {
    console.log(`  skipped (no prices)`);
    continue;
  }
  console.log(`  fetched ${prices.size} daily price(s)`);

  // Pull every event for this owner+symbol, in date order.
  const events = await sql`
    select event_date, event_type, quantity
    from transactions
    where owner_user_id = ${scope.owner_user_id}
      and broker = 'COINBASE'
      and symbol = ${sym}
      and event_type in ('CRYPTO_BUY', 'CRYPTO_SELL', 'CRYPTO_STAKE_REWARD')
    order by event_date
  `;

  // For each date with a price, walk events up to that date and sum qty.
  // Build a running qty timeline first to avoid O(N*M).
  const dates = Array.from(prices.keys()).sort();
  let qty = new Decimal(0);
  let evIdx = 0;
  const rows = [];
  for (const date of dates) {
    while (evIdx < events.length && events[evIdx].event_date <= date) {
      const e = events[evIdx];
      const evQty = new Decimal(e.quantity ?? "0");
      if (e.event_type === "CRYPTO_SELL") qty = qty.minus(evQty);
      else qty = qty.plus(evQty); // BUY or STAKE_REWARD
      evIdx++;
    }
    if (qty.gt(0.00000001)) {
      const price = new Decimal(prices.get(date));
      const value = qty.times(price);
      rows.push({ date, qty: qty.toFixed(18), price: price.toFixed(8), value: value.toFixed(8) });
    }
  }

  // Bulk upsert.
  let written = 0;
  for (const r of rows) {
    await sql`
      insert into crypto_daily_values (owner_user_id, date, symbol, quantity, price_eur, value_eur)
      values (${scope.owner_user_id}, ${r.date}, ${sym}, ${r.qty}, ${r.price}, ${r.value})
      on conflict (owner_user_id, date, symbol) do update
        set quantity = excluded.quantity,
            price_eur = excluded.price_eur,
            value_eur = excluded.value_eur,
            updated_at = now()
    `;
    written++;
  }
  console.log(`  ✓ wrote ${written} day-rows`);

  // Be polite to CoinGecko's 30/min limit.
  await new Promise((r) => setTimeout(r, 2500));
}

console.log("\n=== summary ===");
const summary = await sql`
  select date, round(sum(value_eur::numeric)::numeric, 2) as total_value_eur
  from crypto_daily_values
  group by date
  order by date desc
  limit 5
`;
console.log("Last 5 daily portfolio values:");
console.table(summary);
