import { and, eq, gte, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { brokerAccounts, cryptoWallets, realizedMatches, transactions } from "@/lib/db/schema";

/**
 * Per-coin position view for the Positions page and the Performance tile.
 *
 * Cost basis is computed as the sum of amount_eur over all TRADE events
 * per symbol. NOTE: this treats all TRADEs as buys. For a buy-and-hold
 * wallet that's correct; users who have done sells or in-app conversions
 * will see slightly off numbers — flagged in the UI footer. Adding a
 * proper BUY/SELL distinction is a Phase-2 lift.
 *
 * Current EUR value comes from crypto_wallets (snapshotted at last sync
 * using public Coinbase spot prices). Wallets with the same symbol but
 * different sub-account names (e.g. "ETH Wallet" + "Staked ETH") are
 * aggregated into one position.
 */
export type CryptoPosition = {
  symbol: string;
  quantity: number;
  costBasisEur: number;
  avgPriceEur: number | null;
  currentPriceEur: number | null;
  currentValueEur: number;
  unrealizedPnlEur: number;
  unrealizedPnlPct: number | null;
  realizedPnlYtdEur: number;
  walletCount: number;
  walletNames: string[];
};

export async function getCryptoPositions(ownerUserId: string): Promise<CryptoPosition[]> {
  const db = getDb();

  const walletRows = await db
    .select({
      symbol: cryptoWallets.symbol,
      name: cryptoWallets.name,
      quantity: cryptoWallets.quantity,
      nativeAmount: cryptoWallets.nativeAmount,
    })
    .from(cryptoWallets)
    .where(eq(cryptoWallets.ownerUserId, ownerUserId));

  // Cost basis: BUY events add EUR, SELL events subtract EUR. We also
  // include CRYPTO_STAKE_REWARD because staked rewards become a lot at
  // the EUR fair value at receipt — that contributes to the running cost
  // basis of the holdings if you sell later.
  const costRows = await db
    .select({
      symbol: transactions.symbol,
      eventType: transactions.eventType,
      totalEur: sql<string>`coalesce(sum(${transactions.amountEur}), 0)`,
    })
    .from(transactions)
    .where(and(eq(transactions.ownerUserId, ownerUserId), eq(transactions.broker, "COINBASE")))
    .groupBy(transactions.symbol, transactions.eventType);

  const costBySymbol = new Map<string, number>();
  for (const r of costRows) {
    if (!r.symbol) continue;
    const sign =
      r.eventType === "CRYPTO_BUY" || r.eventType === "CRYPTO_STAKE_REWARD"
        ? 1
        : r.eventType === "CRYPTO_SELL"
        ? -1
        : 0;
    if (sign === 0) continue;
    costBySymbol.set(r.symbol, (costBySymbol.get(r.symbol) ?? 0) + sign * Number(r.totalEur));
  }

  // YTD realized P/L per coin: sum of gain_eur on matches closed this year.
  const yearStart = `${new Date().getUTCFullYear()}-01-01`;
  const realizedRows = await db
    .select({
      symbol: realizedMatches.symbol,
      total: sql<string>`coalesce(sum(${realizedMatches.gainEur}), 0)`,
    })
    .from(realizedMatches)
    .innerJoin(brokerAccounts, eq(realizedMatches.brokerAccountId, brokerAccounts.id))
    .where(
      and(
        eq(realizedMatches.ownerUserId, ownerUserId),
        eq(brokerAccounts.broker, "COINBASE"),
        gte(realizedMatches.closedAt, yearStart),
      ),
    )
    .groupBy(realizedMatches.symbol);
  const realizedBySymbol = new Map(realizedRows.map((r) => [r.symbol, Number(r.total)]));

  type Agg = {
    symbol: string;
    quantity: number;
    currentValueEur: number;
    walletNames: string[];
  };
  const agg = new Map<string, Agg>();
  for (const w of walletRows) {
    if (w.symbol === "EUR") continue;
    const a = agg.get(w.symbol) ?? { symbol: w.symbol, quantity: 0, currentValueEur: 0, walletNames: [] };
    a.quantity += Number(w.quantity);
    a.currentValueEur += Number(w.nativeAmount);
    if (w.name) a.walletNames.push(w.name);
    agg.set(w.symbol, a);
  }

  const positions: CryptoPosition[] = Array.from(agg.values())
    .filter((p) => p.quantity > 0 || p.currentValueEur > 0.01)
    .map((p) => {
      const costBasisEur = costBySymbol.get(p.symbol) ?? 0;
      const unrealizedPnlEur = p.currentValueEur - costBasisEur;
      const avgPriceEur = p.quantity > 0 ? costBasisEur / p.quantity : null;
      const currentPriceEur = p.quantity > 0 ? p.currentValueEur / p.quantity : null;
      const unrealizedPnlPct = costBasisEur > 0.01 ? (unrealizedPnlEur / costBasisEur) * 100 : null;
      return {
        symbol: p.symbol,
        quantity: p.quantity,
        costBasisEur,
        avgPriceEur,
        currentPriceEur,
        currentValueEur: p.currentValueEur,
        unrealizedPnlEur,
        unrealizedPnlPct,
        realizedPnlYtdEur: realizedBySymbol.get(p.symbol) ?? 0,
        walletCount: p.walletNames.length,
        walletNames: p.walletNames,
      };
    });

  positions.sort((a, b) => b.currentValueEur - a.currentValueEur);
  return positions;
}

export type CryptoPortfolioRollup = {
  totalValueEur: number;
  totalCostEur: number;
  unrealizedPnlEur: number;
  unrealizedPnlPct: number | null;
  realizedPnlYtdEur: number;
};

export function rollUpCryptoPositions(positions: CryptoPosition[]): CryptoPortfolioRollup {
  const totalValueEur = positions.reduce((s, p) => s + p.currentValueEur, 0);
  const totalCostEur = positions.reduce((s, p) => s + p.costBasisEur, 0);
  const unrealizedPnlEur = totalValueEur - totalCostEur;
  const unrealizedPnlPct = totalCostEur > 0.01 ? (unrealizedPnlEur / totalCostEur) * 100 : null;
  const realizedPnlYtdEur = positions.reduce((s, p) => s + p.realizedPnlYtdEur, 0);
  return { totalValueEur, totalCostEur, unrealizedPnlEur, unrealizedPnlPct, realizedPnlYtdEur };
}
