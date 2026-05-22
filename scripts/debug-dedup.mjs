import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

console.log("\n=== Check if raw->>'id' actually shares values across duplicate rows ===\n");

const groups = await sql`
  select
    coalesce('coinbase:' || (raw->>'id'), event_fingerprint) as canonical_fp,
    count(*) as ct,
    array_agg(distinct broker_account_id::text) as account_ids,
    array_agg(distinct owner_user_id) as owner_ids
  from transactions
  where broker = 'COINBASE'
  group by canonical_fp
  having count(*) > 1
  order by ct desc
  limit 5
`;
console.table(groups);

console.log("\n=== Are all rows with the same coinbase id in the same broker_account_id? ===\n");
const sameAcc = await sql`
  select
    coalesce('coinbase:' || (raw->>'id'), event_fingerprint) as canonical_fp,
    count(distinct broker_account_id) as distinct_accounts,
    count(*) as ct
  from transactions
  where broker = 'COINBASE'
  group by canonical_fp
  having count(*) > 1
  order by distinct_accounts desc
  limit 5
`;
console.table(sameAcc);

console.log("\n=== Sample two duplicate rows raw to check structure ===\n");
const sample = await sql`
  select id, event_date, broker_account_id, raw->>'id' as cb_id, event_fingerprint
  from transactions
  where broker = 'COINBASE'
    and event_type = 'CRYPTO_STAKE_REWARD'
    and event_date = '2026-05-21'
    and symbol = 'ADA'
  order by created_at
`;
console.table(sample);
