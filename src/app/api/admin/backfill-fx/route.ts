import { NextResponse } from "next/server";
import { and, eq, ne, isNotNull } from "drizzle-orm";
import Decimal from "decimal.js";
import { getCurrentUser } from "@/lib/auth/server";
import { isAdminEmail } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/client";
import { fxRates, transactions, brokerAccounts } from "@/lib/db/schema";
import { fetchEcbHistorical } from "@/lib/quotes/ecb";
import { runReplayForAccount } from "@/lib/imports/ingest";
import { hasValidCronSecret } from "@/lib/auth/cron";

export const maxDuration = 60;

// ECB publishes the historical series from 1999 onwards (~5 MB XML).
// Pre-2020 currencies become more sparse and we don't expect anyone to
// import statements that old, but the cost of bringing the window
// forward to 2020-01-01 is negligible — a few hundred extra rows — and
// it covers pre-2023 Freedom24 and IBKR history that would otherwise
// land with fx_source = MISSING and silently fall back to native
// amounts as if they were EUR (severely inflating cost basis).
const BACKFILL_SINCE = "2020-01-01";
const AMOUNT_FIELDS = [
  "amount",
  "cashAmount",
  "proceeds",
  "fee",
  "realizedPnl",
  "withholdingTax",
] as const;

/**
 * One-shot historical FX backfill + transaction recompute.
 *
 * 1. Pulls ECB's full daily history (filtered to ≥ 2023-01-01) into fx_rates.
 * 2. For every non-EUR transaction belonging to the caller, looks up the rate
 *    on the trade date and recomputes amount_eur, cash_amount_eur,
 *    proceeds_eur, fee_eur, realized_pnl_eur, withholding_tax_eur.
 * 3. Re-runs FIFO replay for each affected broker_account so lots/positions
 *    inherit the corrected EUR cost basis.
 *
 * Auth: cron secret OR logged-in user.
 */
export async function POST(req: Request) {
  // Admin OR cron. Previously any logged-in user could trigger the
  // global ECB historical pull + per-user recompute — an allowlisted
  // non-admin could burn ECB request budget and force replays.
  let ownerUserId: string | null = null;
  if (!hasValidCronSecret(req)) {
    const user = await getCurrentUser();
    if (!user) return new Response("unauthorized", { status: 401 });
    if (!isAdminEmail(user.email)) return new Response("forbidden", { status: 403 });
    ownerUserId = user.id;
  }

  const db = getDb();

  // 1. Insert historical FX rates in chunks (Postgres caps parameters around 65k).
  const rates = await fetchEcbHistorical(BACKFILL_SINCE);
  const CHUNK = 1000;
  let fxInserted = 0;
  for (let i = 0; i < rates.length; i += CHUNK) {
    const slice = rates.slice(i, i + CHUNK);
    await db.insert(fxRates).values(slice).onConflictDoNothing();
    fxInserted += slice.length;
  }

  if (!ownerUserId) {
    return NextResponse.json({ fxInserted, recomputedTx: 0, replayedAccounts: 0 });
  }

  // 2. Reload fx_rates into a date|currency lookup map.
  const allFx = await db.select().from(fxRates);
  const rateMap = new Map<string, string>();
  for (const r of allFx) rateMap.set(`${r.date}|${r.fromCurrency}`, r.rate);

  // 3. Walk this user's non-EUR transactions and recompute the *_eur columns.
  const txRows = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.ownerUserId, ownerUserId),
        ne(transactions.currency, "EUR"),
        isNotNull(transactions.amount),
      ),
    );

  const affectedAccounts = new Set<string>();
  let recomputedTx = 0;
  for (const t of txRows) {
    const rate = rateMap.get(`${t.eventDate}|${t.currency}`);
    if (!rate) continue;
    const r = new Decimal(rate);
    const patch: Record<string, string | boolean | null> = {
      fxSource: "ECB",
      requiresReview: false,
    };
    for (const f of AMOUNT_FIELDS) {
      const v = t[f as keyof typeof t] as string | null | undefined;
      if (v === null || v === undefined) continue;
      patch[`${f}Eur`] = new Decimal(v).div(r).toFixed(2);
    }
    await db.update(transactions).set(patch).where(eq(transactions.id, t.id));
    if (t.brokerAccountId) affectedAccounts.add(t.brokerAccountId);
    recomputedTx++;
  }

  // 4. Re-run replay for each affected broker_account so lots/positions
  //    pick up the corrected EUR cost basis.
  const accountRows = await db
    .select()
    .from(brokerAccounts)
    .where(eq(brokerAccounts.ownerUserId, ownerUserId));
  const ownedAccountIds = new Set(accountRows.map((a) => a.id));
  let replayedAccounts = 0;
  for (const id of affectedAccounts) {
    if (!ownedAccountIds.has(id)) continue;
    await runReplayForAccount(ownerUserId, id);
    replayedAccounts++;
  }

  return NextResponse.json({
    fxInserted,
    rateMapSize: rateMap.size,
    recomputedTx,
    replayedAccounts,
  });
}
