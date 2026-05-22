import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

const wallets = await sql`
  select symbol, name, quantity, native_amount, native_currency, "primary"
  from crypto_wallets
  order by native_amount::numeric desc
  limit 20
`;
console.log("\n=== crypto_wallets (top 20 by native_amount) ===");
console.table(wallets);

const txByType = await sql`
  select event_type, count(*) as count, sum(amount_eur::numeric) as total_eur
  from transactions
  where broker = 'COINBASE'
  group by event_type
  order by count desc
`;
console.log("\n=== transactions grouped by event_type (COINBASE only) ===");
console.table(txByType);

const stakingSample = await sql`
  select event_date, symbol, quantity, amount, amount_eur, currency, name
  from transactions
  where broker = 'COINBASE'
    and event_type = 'CRYPTO_STAKE_REWARD'
  order by event_date desc
  limit 10
`;
console.log("\n=== latest 10 staking events ===");
console.table(stakingSample);

const stakingYtd = await sql`
  select symbol, sum(amount_eur::numeric) as total_eur, count(*) as count
  from transactions
  where broker = 'COINBASE'
    and event_type = 'CRYPTO_STAKE_REWARD'
    and event_date >= '2026-01-01'
  group by symbol
`;
console.log("\n=== staking YTD 2026 by symbol ===");
console.table(stakingYtd);
