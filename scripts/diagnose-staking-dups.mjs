import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

console.log("\n=== Duplicate groups: same economic identity (symbol, date, qty, amount) ===\n");
const groups = await sql`
  select symbol,
         event_date,
         quantity,
         amount,
         count(*) as dup_count,
         array_agg(distinct description) as descriptions,
         array_agg(distinct event_fingerprint) as fingerprints,
         array_agg(name) as wallet_names,
         array_agg(raw->>'id') as coinbase_ids
  from transactions
  where broker = 'COINBASE'
    and event_type = 'CRYPTO_STAKE_REWARD'
  group by symbol, event_date, quantity, amount
  having count(*) > 1
  order by event_date desc
  limit 10
`;
if (groups.length === 0) {
  console.log("No same-content duplicate groups. The 840-event count is real, not doubled.");
} else {
  for (const g of groups) {
    console.log(
      `\n${g.event_date} ${g.symbol} qty=${g.quantity} amt=${g.amount}  ×${g.dup_count}`,
    );
    console.log(`  fingerprints:      ${g.fingerprints.length} distinct = ${g.fingerprints.length === 1 ? "match (should dedupe)" : "DIFFER (broken)"}`);
    console.log(`  descriptions:      ${JSON.stringify(g.descriptions)}`);
    console.log(`  wallet names:      ${JSON.stringify(g.wallet_names)}`);
    console.log(`  coinbase tx ids:   ${JSON.stringify(g.coinbase_ids)}`);
  }
}

console.log("\n\n=== Overall dup ratio ===");
const overall = await sql`
  with grouped as (
    select symbol, event_date, quantity, amount, count(*) as dup_count
    from transactions
    where broker = 'COINBASE' and event_type = 'CRYPTO_STAKE_REWARD'
    group by symbol, event_date, quantity, amount
  )
  select
    sum(dup_count) as total_rows,
    count(*) as unique_economic_events,
    sum(case when dup_count > 1 then dup_count - 1 else 0 end) as extra_rows_from_duplication,
    round((sum(case when dup_count > 1 then dup_count - 1 else 0 end)::numeric / sum(dup_count) * 100)::numeric, 1) as percent_duplicates
  from grouped
`;
console.table(overall);
