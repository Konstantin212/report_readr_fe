import { and, eq, gte, lt } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { brokerAccounts, realizedMatches, transactions } from "@/lib/db/schema";

/**
 * Anlage SO draft builder — two independent German income buckets:
 *
 *  §22 Nr. 3 EStG ("sonstige Leistungen"): staking rewards received in the
 *  tax year, each taxed at the EUR fair value at the moment of receipt.
 *  Own annual €256 Freigrenze — a cliff, not an allowance: below €256
 *  nothing is owed; at €256 the entire sum becomes taxable.
 *
 *  §23 EStG (private Veräußerungsgeschäfte): crypto sold within one year of
 *  acquisition. Short-term matches net against each other (gains and losses
 *  within §23 offset); the result carries its OWN Freigrenze — €600 through
 *  2023, €1000 from 2024 — again a cliff. Coins held longer than a year are
 *  tax-free and reported for completeness only.
 *
 * These two buckets are legally SEPARATE: they sit on different Anlage SO
 * lines, carry different Freigrenzen, and a §23 loss may not reduce §22
 * income (§23 Abs. 3 S. 7-8 EStG — §23 losses only offset §23 gains and
 * otherwise carry forward). Do NOT sum them into one threshold. The pure
 * calculator below encodes this; buildAnlageSo just feeds it DB rows.
 */

/** §22 Nr. 3 EStG annual Freigrenze (cliff). */
export const FREIGRENZE_22_EUR = 256;
/** Back-compat alias — the §22 Freigrenze. */
export const FREIGRENZE_EUR = FREIGRENZE_22_EUR;

/** §23 EStG Freigrenze: raised from €600 to €1000 effective 2024. */
export function freigrenze23For(taxYear: number): number {
  return taxYear >= 2024 ? 1000 : 600;
}

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

export type AnlageSoTotals = {
  /** §22 Nr. 3 — staking income, its own €256 cliff. */
  section22: {
    stakingIncomeEur: number;
    eventCount: number;
    freigrenzeEur: number;
    freigrenzeReached: boolean;
    taxableEur: number;
  };
  /** §23 — private-sale gains, its own €600/€1000 cliff. */
  section23: {
    /** Net of short-term gains AND losses (long-term excluded). */
    shortTermNetGainEur: number;
    longTermTaxFreeEur: number;
    matchCount: number;
    freigrenzeEur: number;
    freigrenzeReached: boolean;
    taxableEur: number;
    /** Magnitude of a §23 net loss, eligible for carryforward. */
    lossCarryforwardEur: number;
  };
  /** §22 + §23 taxable, for display only — they file on separate lines. */
  totalTaxableEur: number;
};

export type AnlageSoDraft = {
  taxYear: number;
  taxpayerName: string | null;
  total: AnlageSoTotals;
  perCoin: { symbol: string; eventCount: number; quantity: number; totalEur: number }[];
  events: AnlageSoEvent[];
  section23Matches: Section23Match[];
  generatedAt: string;
};

const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * Pure calculator for the two Anlage SO buckets. Kept free of DB access so
 * the German-law logic (separate Freigrenzen, no cross-bucket offset) is
 * unit-testable in isolation, mirroring the pure core of german-tax.ts.
 */
export function computeAnlageSoTotals(
  stakingIncomeEur: number,
  eventCount: number,
  section23Matches: Section23Match[],
  taxYear: number,
): AnlageSoTotals {
  const staking = round2(stakingIncomeEur);
  const s22Reached = staking >= FREIGRENZE_22_EUR;

  const shortTermNetGain = round2(
    section23Matches.filter((m) => !m.isLongTerm).reduce((s, m) => s + m.gainEur, 0),
  );
  const longTermTaxFree = round2(
    section23Matches.filter((m) => m.isLongTerm).reduce((s, m) => s + m.gainEur, 0),
  );
  const freigrenze23 = freigrenze23For(taxYear);
  // A §23 loss is never "above the Freigrenze" — the cliff only gates
  // positive net gains; a negative net is a carryforward, not taxable.
  const s23Reached = shortTermNetGain >= freigrenze23;
  const s23Taxable = s23Reached ? shortTermNetGain : 0;
  const s23LossCarryforward = shortTermNetGain < 0 ? round2(-shortTermNetGain) : 0;

  const s22Taxable = s22Reached ? staking : 0;

  return {
    section22: {
      stakingIncomeEur: staking,
      eventCount,
      freigrenzeEur: FREIGRENZE_22_EUR,
      freigrenzeReached: s22Reached,
      taxableEur: s22Taxable,
    },
    section23: {
      shortTermNetGainEur: shortTermNetGain,
      longTermTaxFreeEur: longTermTaxFree,
      matchCount: section23Matches.length,
      freigrenzeEur: freigrenze23,
      freigrenzeReached: s23Reached,
      taxableEur: s23Taxable,
      lossCarryforwardEur: s23LossCarryforward,
    },
    totalTaxableEur: round2(s22Taxable + s23Taxable),
  };
}

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

  const total = computeAnlageSoTotals(stakingIncomeEur, events.length, section23Matches, taxYear);

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
    total,
    perCoin,
    events,
    section23Matches,
    generatedAt: new Date().toISOString(),
  };
}
