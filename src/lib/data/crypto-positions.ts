import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { cryptoWallets, transactions } from "@/lib/db/schema";

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

  const costRows = await db
    .select({
      symbol: transactions.symbol,
      totalCost: sql<string>`coalesce(sum(${transactions.amountEur}), 0)`,
    })
    .from(transactions)
    .where(and(eq(transactions.ownerUserId, ownerUserId), eq(transactions.broker, "COINBASE"), eq(transactions.eventType, "TRADE")))
    .groupBy(transactions.symbol);

  const costBySymbol = new Map(costRows.filter((r) => r.symbol).map((r) => [r.symbol as string, Number(r.totalCost)]));

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
};

export function rollUpCryptoPositions(positions: CryptoPosition[]): CryptoPortfolioRollup {
  const totalValueEur = positions.reduce((s, p) => s + p.currentValueEur, 0);
  const totalCostEur = positions.reduce((s, p) => s + p.costBasisEur, 0);
  const unrealizedPnlEur = totalValueEur - totalCostEur;
  const unrealizedPnlPct = totalCostEur > 0.01 ? (unrealizedPnlEur / totalCostEur) * 100 : null;
  return { totalValueEur, totalCostEur, unrealizedPnlEur, unrealizedPnlPct };
}
