import { and, eq, gte, lt } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";

/**
 * Anlage SO §22 Nr. 3 EStG ("sonstige Leistungen") draft builder.
 *
 * Scope (Phase 1): staking rewards received in the tax year. Each payout
 * is taxed as income at the EUR fair value at the moment of receipt, and
 * an annual €256 Freigrenze applies — a cliff, not an allowance. Below
 * €256 nothing is owed; at €256 the entire sum becomes taxable.
 *
 * Out of scope (Phase 2): §23 EStG private sale gains (crypto held <1
 * year that you sell). User has not sold anything; we don't compute
 * this. The PDF/CSV documents §22 only and the UI flags this scope.
 */

export const FREIGRENZE_EUR = 256;

export type AnlageSoEvent = {
  date: string;
  symbol: string;
  quantity: number;
  eurValue: number;
  description: string | null;
  coinbaseId: string | null;
  walletName: string | null;
  fxSource: string | null;
};

export type AnlageSoDraft = {
  taxYear: number;
  taxpayerName: string | null;
  total: {
    stakingIncomeEur: number;
    eventCount: number;
    freigrenzeEur: number;
    freigrenzeReached: boolean;
    taxableEur: number;
  };
  perCoin: { symbol: string; eventCount: number; quantity: number; totalEur: number }[];
  events: AnlageSoEvent[];
  generatedAt: string;
};

export async function buildAnlageSo(ownerUserId: string, taxYear: number, taxpayerName: string | null): Promise<AnlageSoDraft> {
  const yearStart = `${taxYear}-01-01`;
  const yearEnd = `${taxYear + 1}-01-01`;

  const rows = await getDb()
    .select({
      eventDate: transactions.eventDate,
      symbol: transactions.symbol,
      quantity: transactions.quantity,
      amountEur: transactions.amountEur,
      description: transactions.description,
      name: transactions.name,
      fxSource: transactions.fxSource,
      raw: transactions.raw,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.ownerUserId, ownerUserId),
        eq(transactions.broker, "COINBASE"),
        eq(transactions.eventType, "CRYPTO_STAKE_REWARD"),
        gte(transactions.eventDate, yearStart),
        lt(transactions.eventDate, yearEnd),
      ),
    )
    .orderBy(transactions.eventDate);

  const events: AnlageSoEvent[] = rows.map((r) => ({
    date: r.eventDate,
    symbol: r.symbol ?? "?",
    quantity: Number(r.quantity ?? 0),
    eurValue: Number(r.amountEur ?? 0),
    description: r.description,
    coinbaseId: (r.raw as { id?: string } | null)?.id ?? null,
    walletName: r.name,
    fxSource: r.fxSource,
  }));

  const stakingIncomeEur = events.reduce((s, e) => s + e.eurValue, 0);
  const freigrenzeReached = stakingIncomeEur >= FREIGRENZE_EUR;

  const perCoinMap = new Map<string, { eventCount: number; quantity: number; totalEur: number }>();
  for (const e of events) {
    const agg = perCoinMap.get(e.symbol) ?? { eventCount: 0, quantity: 0, totalEur: 0 };
    agg.eventCount += 1;
    agg.quantity += e.quantity;
    agg.totalEur += e.eurValue;
    perCoinMap.set(e.symbol, agg);
  }
  const perCoin = Array.from(perCoinMap.entries())
    .map(([symbol, agg]) => ({ symbol, ...agg }))
    .sort((a, b) => b.totalEur - a.totalEur);

  return {
    taxYear,
    taxpayerName,
    total: {
      stakingIncomeEur,
      eventCount: events.length,
      freigrenzeEur: FREIGRENZE_EUR,
      freigrenzeReached,
      taxableEur: freigrenzeReached ? stakingIncomeEur : 0,
    },
    perCoin,
    events,
    generatedAt: new Date().toISOString(),
  };
}
