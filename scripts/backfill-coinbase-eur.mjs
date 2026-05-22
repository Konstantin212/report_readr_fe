import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

// Convention: rate stored as `from_currency=USD, to_currency=EUR, rate=R`
// where amount_in_EUR = amount_in_USD / R. (See lib/ledger/fx.ts.)
console.log("\nBackfilling amount_eur for COINBASE transactions in USD…\n");

// First pass: exact date match.
const updated = await sql`
  with fx as (
    select date, from_currency, rate
    from fx_rates
    where to_currency = 'EUR'
  )
  update transactions t
  set amount_eur = round((t.amount::numeric / fx.rate::numeric)::numeric, 8),
      fx_source = 'ECB',
      requires_review = false
  from fx
  where t.broker = 'COINBASE'
    and t.currency = fx.from_currency
    and t.event_date = fx.date
    and t.amount_eur is null
    and t.amount is not null
  returning t.id
`;
console.log(`Updated ${updated.length} rows with EUR amounts (exact date match).`);

// Second pass: weekend/holiday lookback — for each row still missing,
// pick the most-recent fx_rate strictly before the event_date. This is
// the Finanzamt convention (use the nearest preceding publication).
const updatedLookback = await sql`
  with candidates as (
    select t.id, t.amount, t.currency, t.event_date,
           (select rate
            from fx_rates fx
            where fx.from_currency = t.currency
              and fx.to_currency = 'EUR'
              and fx.date < t.event_date
            order by fx.date desc
            limit 1) as rate
    from transactions t
    where t.broker = 'COINBASE'
      and t.amount_eur is null
      and t.amount is not null
  )
  update transactions t
  set amount_eur = round((t.amount::numeric / c.rate::numeric)::numeric, 8),
      fx_source = 'ECB',
      requires_review = false
  from candidates c
  where t.id = c.id and c.rate is not null
  returning t.id
`;
console.log(`Updated ${updatedLookback.length} rows via nearest-preceding lookback (weekends/holidays).`);

const stillMissing = await sql`
  select event_date, currency, count(*) as count
  from transactions
  where broker = 'COINBASE'
    and amount_eur is null
    and amount is not null
  group by event_date, currency
  order by event_date desc
  limit 10
`;
if (stillMissing.length > 0) {
  console.log("\nRows still missing EUR (no FX rate for date+currency):");
  console.table(stillMissing);
} else {
  console.log("\nNo COINBASE rows remain without amount_eur.");
}

const ytd = await sql`
  select symbol,
         count(*) as events,
         round(sum(amount_eur::numeric)::numeric, 2) as total_eur
  from transactions
  where broker = 'COINBASE'
    and event_type = 'CRYPTO_STAKE_REWARD'
    and event_date >= '2026-01-01'
  group by symbol
  order by total_eur desc
`;
console.log("\nStaking YTD 2026 after backfill:");
console.table(ytd);
