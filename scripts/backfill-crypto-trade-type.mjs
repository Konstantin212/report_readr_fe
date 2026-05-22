import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const dryRun = !process.argv.includes("--apply");

console.log(dryRun ? "DRY RUN — pass --apply to commit\n" : "APPLYING\n");

// Preview: how many existing COINBASE rows are still typed as 'TRADE'?
const preview = await sql`
  select event_type, count(*) as ct,
         array_agg(distinct raw->>'type') as raw_types
  from transactions
  where broker = 'COINBASE'
    and event_type = 'TRADE'
  group by event_type
`;
console.log("Existing TRADE rows for COINBASE:");
console.table(preview);

if (!dryRun) {
  // raw->>'type' is the original Coinbase tx type ('buy', 'sell', 'trade').
  // Map 'buy' → CRYPTO_BUY, 'sell' → CRYPTO_SELL. 'trade' (generic swap)
  // splits by sign of amount column.
  const buyUpdated = await sql`
    update transactions
    set event_type = 'CRYPTO_BUY'
    where broker = 'COINBASE'
      and event_type = 'TRADE'
      and raw->>'type' = 'buy'
    returning id
  `;
  console.log(`  ✓ TRADE → CRYPTO_BUY: ${buyUpdated.length}`);

  const sellUpdated = await sql`
    update transactions
    set event_type = 'CRYPTO_SELL'
    where broker = 'COINBASE'
      and event_type = 'TRADE'
      and raw->>'type' = 'sell'
    returning id
  `;
  console.log(`  ✓ TRADE → CRYPTO_SELL: ${sellUpdated.length}`);

  // For raw type 'trade' (swap), use sign of amount.
  const swapBuy = await sql`
    update transactions
    set event_type = 'CRYPTO_BUY'
    where broker = 'COINBASE'
      and event_type = 'TRADE'
      and raw->>'type' in ('trade', 'advanced_trade_fill')
      and (raw->'amount'->>'amount')::numeric > 0
    returning id
  `;
  console.log(`  ✓ TRADE (positive swap) → CRYPTO_BUY: ${swapBuy.length}`);

  const swapSell = await sql`
    update transactions
    set event_type = 'CRYPTO_SELL'
    where broker = 'COINBASE'
      and event_type = 'TRADE'
      and raw->>'type' in ('trade', 'advanced_trade_fill')
      and (raw->'amount'->>'amount')::numeric < 0
    returning id
  `;
  console.log(`  ✓ TRADE (negative swap) → CRYPTO_SELL: ${swapSell.length}`);
}

console.log("\nFinal distribution:");
const after = await sql`
  select event_type, count(*) as ct
  from transactions
  where broker = 'COINBASE'
  group by event_type
  order by ct desc
`;
console.table(after);

if (dryRun) console.log("\nRe-run with: node scripts/backfill-crypto-trade-type.mjs --apply");
