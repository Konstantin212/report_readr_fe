import { and, eq, gte, lt } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { brokerAccounts, realizedMatches, transactions } from "@/lib/db/schema";

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

export type Section23Match = {
  symbol: string;
  openedAt: string;
  closedAt: string;
  qty: number;
  costEur: number;
  proceedsEur: number;
  gainEur: number;
  holdingDays: number;
  isLongTerm: boolean;
};

export type AnlageSoDraft = {
  taxYear: number;
  taxpayerName: string | null;
  total: {
    stakingIncomeEur: number;
    eventCount: number;
    section23ShortTermGainEur: number;
    section23LongTermTaxFreeEur: number;
    section23MatchCount: number;
    freigrenzeEur: number;
    freigrenzeReached: boolean;
    taxableEur: number;
  };
  perCoin: { symbol: string; eventCount: number; quantity: number; totalEur: number }[];
  events: AnlageSoEvent[];
  section23Matches: Section23Match[];
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

  // §23 EStG short-term private sale gains (held ≤ 365 days). Joins
  // realized_matches → broker_accounts on broker_account_id to scope
  // to COINBASE only.
  const section23Rows = await getDb()
    .select({
      symbol: realizedMatches.symbol,
      qty: realizedMatches.qty,
      costEur: realizedMatches.costEur,
      proceedsEur: realizedMatches.proceedsEur,
      gainEur: realizedMatches.gainEur,
      holdingDays: realizedMatches.holdingDays,
      isLongTerm: realizedMatches.isLongTerm,
      closedAt: realizedMatches.closedAt,
      brokerName: brokerAccounts.broker,
    })
    .from(realizedMatches)
    .innerJoin(brokerAccounts, eq(realizedMatches.brokerAccountId, brokerAccounts.id))
    .where(
      and(
        eq(realizedMatches.ownerUserId, ownerUserId),
        eq(brokerAccounts.broker, "COINBASE"),
        gte(realizedMatches.closedAt, yearStart),
        lt(realizedMatches.closedAt, yearEnd),
      ),
    );

  // openedAt is derivable as closedAt - holdingDays but we don't have it
  // on the row directly; reconstruct for the report.
  const section23Matches: Section23Match[] = section23Rows.map((r) => {
    const closed = new Date(`${r.closedAt}T00:00:00Z`);
    closed.setUTCDate(closed.getUTCDate() - r.holdingDays);
    return {
      symbol: r.symbol,
      openedAt: closed.toISOString().slice(0, 10),
      closedAt: r.closedAt,
      qty: Number(r.qty),
      costEur: Number(r.costEur),
      proceedsEur: Number(r.proceedsEur),
      gainEur: Number(r.gainEur),
      holdingDays: r.holdingDays,
      isLongTerm: r.isLongTerm,
    };
  });

  const section23ShortTermGainEur = section23Matches
    .filter((m) => !m.isLongTerm)
    .reduce((s, m) => s + m.gainEur, 0);
  const section23LongTermTaxFreeEur = section23Matches
    .filter((m) => m.isLongTerm)
    .reduce((s, m) => s + m.gainEur, 0);

  // Combined §22 (staking income) + §23 (short-term sale gains) is
  // what the €256 Freigrenze applies to in aggregate.
  const combinedBaseEur = stakingIncomeEur + section23ShortTermGainEur;
  const freigrenzeReached = combinedBaseEur >= FREIGRENZE_EUR;

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
      section23ShortTermGainEur,
      section23LongTermTaxFreeEur,
      section23MatchCount: section23Matches.length,
      freigrenzeEur: FREIGRENZE_EUR,
      freigrenzeReached,
      taxableEur: freigrenzeReached ? combinedBaseEur : 0,
    },
    perCoin,
    events,
    section23Matches,
    generatedAt: new Date().toISOString(),
  };
}
