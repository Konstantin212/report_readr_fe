// Recompute FIFO lots + realized matches for every Coinbase broker_account
// without re-pulling from the Coinbase API. Use after the trade-type
// backfill so existing TRADE rows that became CRYPTO_BUY/CRYPTO_SELL get
// matched into lots.
import { neon } from "@neondatabase/serverless";
import Decimal from "decimal.js";

const sql = neon(process.env.DATABASE_URL);

const stubs = await sql`
  select ba.id, ba.owner_user_id
  from broker_accounts ba
  where ba.broker = 'COINBASE'
`;
console.log(`Rebuilding lots for ${stubs.length} broker_account stub(s)\n`);

for (const stub of stubs) {
  const events = await sql`
    select event_fingerprint, event_type, event_date, symbol, quantity, amount_eur
    from transactions
    where owner_user_id = ${stub.owner_user_id}
      and broker_account_id = ${stub.id}
      and event_type in ('CRYPTO_BUY', 'CRYPTO_SELL', 'CRYPTO_STAKE_REWARD')
    order by event_date, event_fingerprint
  `;

  // FIFO replay
  const openLots = new Map();
  const matches = [];
  for (const e of events) {
    if (!e.symbol) continue;
    const qty = new Decimal(e.quantity ?? "0");
    const amountEur = new Decimal(e.amount_eur ?? "0");
    if (qty.lte(0)) continue;

    if (e.event_type === "CRYPTO_BUY" || e.event_type === "CRYPTO_STAKE_REWARD") {
      const list = openLots.get(e.symbol) ?? [];
      list.push({
        symbol: e.symbol,
        openedAt: e.event_date,
        remainingQty: qty.toString(),
        costEur: amountEur.toString(),
        sourceEventFingerprint: e.event_fingerprint,
      });
      openLots.set(e.symbol, list);
      continue;
    }

    if (e.event_type === "CRYPTO_SELL") {
      const list = openLots.get(e.symbol) ?? [];
      const totalSold = qty;
      let toClose = qty;
      const proceedsTotal = amountEur;
      while (toClose.gt(0) && list.length > 0) {
        const lot = list[0];
        const lotQty = new Decimal(lot.remainingQty);
        const consume = Decimal.min(lotQty, toClose);
        const costPortion = new Decimal(lot.costEur).mul(consume).div(lotQty);
        const proceedsPortion = proceedsTotal.mul(consume).div(totalSold);
        const gain = proceedsPortion.minus(costPortion);
        const days = Math.round((Date.parse(e.event_date) - Date.parse(lot.openedAt)) / 86400000);
        matches.push({
          symbol: lot.symbol,
          openingFingerprint: lot.sourceEventFingerprint,
          closingFingerprint: e.event_fingerprint,
          qty: consume.toString(),
          costEur: costPortion.toFixed(2),
          proceedsEur: proceedsPortion.toFixed(2),
          gainEur: gain.toFixed(2),
          holdingDays: days,
          isLongTerm: days > 365,
          closedAt: e.event_date,
        });
        const remaining = lotQty.minus(consume);
        if (remaining.lte(0)) list.shift();
        else {
          lot.remainingQty = remaining.toString();
          lot.costEur = new Decimal(lot.costEur).minus(costPortion).toFixed(8);
        }
        toClose = toClose.minus(consume);
      }
    }
  }

  const lots = [...openLots.values()].flat();
  console.log(`  stub ${stub.id}: ${events.length} events → ${lots.length} open lots, ${matches.length} realized matches`);

  await sql`delete from lots where owner_user_id = ${stub.owner_user_id} and broker_account_id = ${stub.id}`;
  await sql`delete from realized_matches where owner_user_id = ${stub.owner_user_id} and broker_account_id = ${stub.id}`;

  for (const l of lots) {
    await sql`
      insert into lots (owner_user_id, broker_account_id, symbol, opened_at, remaining_qty, cost_eur, source_event_fingerprint)
      values (${stub.owner_user_id}, ${stub.id}, ${l.symbol}, ${l.openedAt}, ${l.remainingQty}, ${l.costEur}, ${l.sourceEventFingerprint})
    `;
  }
  for (const m of matches) {
    await sql`
      insert into realized_matches (owner_user_id, broker_account_id, symbol, opening_fingerprint, closing_fingerprint, qty, cost_eur, proceeds_eur, gain_eur, holding_days, is_long_term, closed_at)
      values (${stub.owner_user_id}, ${stub.id}, ${m.symbol}, ${m.openingFingerprint}, ${m.closingFingerprint}, ${m.qty}, ${m.costEur}, ${m.proceedsEur}, ${m.gainEur}, ${m.holdingDays}, ${m.isLongTerm}, ${m.closedAt})
    `;
  }
}

console.log("\n=== §23 realized matches summary ===");
const byYear = await sql`
  select extract(year from closed_at::date)::int as year,
         count(*) as match_count,
         round(sum(gain_eur::numeric) filter (where is_long_term = false)::numeric, 2) as short_term_gain_eur,
         round(sum(gain_eur::numeric) filter (where is_long_term = true)::numeric, 2) as long_term_tax_free_eur
  from realized_matches rm
  inner join broker_accounts ba on ba.id = rm.broker_account_id
  where ba.broker = 'COINBASE'
  group by year
  order by year desc
`;
console.table(byYear);
