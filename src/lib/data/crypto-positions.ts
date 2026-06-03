import { and, eq, gte, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { brokerAccounts, cryptoWallets, lots, realizedMatches } from "@/lib/db/schema";

/**
 * Per-coin position view for the Positions page and the Performance tile.
 *
 * Cost basis comes from the `lots` table — FIFO-replay output. Each open
 * lot carries its remaining qty + the *remaining* EUR cost basis (scaled
 * down as sells consume it). Summing those per symbol gives the correct
 * unrealized cost basis no matter how many buys/sells/swaps happened.
 *
 * The previous naive `sum(BUY.amount_eur) − sum(SELL.amount_eur)` broke
 * on coins like USDC where transfers (skipped by the mapper) reduced
 * the wallet qty without reducing the cost basis — producing absurd
 * residual values like €32 cost on a €0.005 wallet (the surfaced
 * −99.98% P/L).
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

  // Sum remaining cost basis from FIFO lots scoped to COINBASE accounts.
  // Each row in `lots` represents an open lot (something still held); its
  // cost_eur is the original purchase cost scaled by how much remains.
  const lotRows = await db
    .select({
      symbol: lots.symbol,
      qty: sql<string>`coalesce(sum(${lots.remainingQty}), 0)`,
      cost: sql<string>`coalesce(sum(${lots.costEur}), 0)`,
    })
    .from(lots)
    .innerJoin(brokerAccounts, eq(lots.brokerAccountId, brokerAccounts.id))
    .where(and(eq(lots.ownerUserId, ownerUserId), eq(brokerAccounts.broker, "COINBASE")))
    .groupBy(lots.symbol);

  const costBySymbol = new Map<string, { eur: number; qty: number }>();
  for (const r of lotRows) {
    if (!r.symbol) continue;
    costBySymbol.set(r.symbol, { eur: Number(r.cost), qty: Number(r.qty) });
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
      const lotInfo = costBySymbol.get(p.symbol);
      // Scale the lots' cost basis by what the wallet currently shows.
      // The lots table tracks FIFO consumption from sells but doesn't see
      // network sends/receives outside Coinbase; the wallet snapshot
      // does. If the wallet has less than the lots think, scale down.
      // If the wallet has more (received outside), keep lot cost as-is.
      let costBasisEur = lotInfo?.eur ?? 0;
      if (lotInfo && lotInfo.qty > 0 && p.quantity < lotInfo.qty) {
        costBasisEur = lotInfo.eur * (p.quantity / lotInfo.qty);
      }
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
