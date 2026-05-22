import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const dryRun = process.argv.includes("--apply") ? false : true;

console.log(dryRun ? "DRY RUN — pass --apply to commit changes\n" : "APPLYING CHANGES\n");

// Step 0: identify orphan COINBASE broker_account stubs. The "live" stub
// has account_number = a currently-existing crypto_accounts.id; an
// orphan stub is one whose account_number no longer points to a row in
// crypto_accounts (left over after a disconnect/reconnect cycle).
console.log("Step 0: locate live vs orphan COINBASE broker_account stubs…");
const stubs = await sql`
  select ba.id, ba.owner_user_id, ba.account_number,
         (ba.account_number::uuid in (select id from crypto_accounts)) as is_live,
         (select count(*) from transactions t where t.broker_account_id = ba.id) as tx_count
  from broker_accounts ba
  where ba.broker = 'COINBASE'
  order by ba.owner_user_id, is_live desc
`;
console.table(stubs);

const orphans = stubs.filter((s) => !s.is_live);
if (orphans.length === 0) {
  console.log("No orphan stubs. Different problem — investigate manually.");
  process.exit(0);
}

// Step 1: delete every transaction owned by an orphan stub. The "live"
// stub has the same Coinbase tx.ids — we verified in the debug diagnostic
// that every duplicate pair shares the same raw->>'id'. Safe to drop the
// orphan's rows entirely; nothing unique would be lost.
console.log(`\nStep 1: delete transactions belonging to ${orphans.length} orphan stub(s)…`);
const orphanIds = orphans.map((o) => o.id);
const orphanTxPreview = await sql`
  select count(*) as count from transactions
  where broker_account_id = any(${orphanIds}::uuid[])
`;
console.log(`  ${orphanTxPreview[0].count} row(s) will be deleted`);

if (!dryRun) {
  const deletedTx = await sql`
    delete from transactions
    where broker_account_id = any(${orphanIds}::uuid[])
    returning id
  `;
  console.log(`  ✓ Deleted ${deletedTx.length}`);
}

// Step 2: delete the orphan broker_account rows themselves so they don't
// resurface in the diagnostic.
console.log(`\nStep 2: delete orphan broker_account stub(s)…`);
if (!dryRun) {
  const deletedStubs = await sql`
    delete from broker_accounts
    where id = any(${orphanIds}::uuid[])
    returning id
  `;
  console.log(`  ✓ Deleted ${deletedStubs.length} stub(s)`);
}

// Step 3: rewrite event_fingerprint to the canonical 'coinbase:<id>'
// form so future syncs dedupe via the unique constraint.
console.log("\nStep 3: rewrite event_fingerprint for remaining Coinbase rows…");
const refingerPreview = await sql`
  select count(*) as count
  from transactions
  where broker = 'COINBASE'
    and raw->>'id' is not null
    and event_fingerprint <> 'coinbase:' || (raw->>'id')
`;
console.log(`  ${refingerPreview[0].count} row(s) need re-fingerprinting`);

if (!dryRun) {
  const updated = await sql`
    update transactions
    set event_fingerprint = 'coinbase:' || (raw->>'id')
    where broker = 'COINBASE' and raw->>'id' is not null
    returning id
  `;
  console.log(`  ✓ Updated ${updated.length}`);
}

// Step 4: show YTD staking totals after.
console.log("\nStep 4: staking YTD per coin (current state)…");
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
console.table(ytd);

if (dryRun) {
  console.log("\nRe-run with: node scripts/dedup-coinbase.mjs --apply");
}
