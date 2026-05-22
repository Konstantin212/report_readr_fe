import { and, desc, eq, gte, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { cryptoAccounts, cryptoWallets, transactions } from "@/lib/db/schema";

/**
 * The €256 cliff for §22 Nr. 3 EStG (sonstige Leistungen). If a German
 * resident's total such income across all sources stays strictly below
 * this, it's tax-free; reaching the threshold makes the entire amount
 * taxable. Surface this as a progress indicator on the Dashboard.
 */
export const FREIGRENZE_EUR = 256;

export type CryptoSummary = {
  hasAccounts: boolean;
  totalValueEur: number;
  walletCount: number;
  lastSyncAt: Date | null;
  topHoldings: {
    symbol: string;
    name: string | null;
    quantity: number;
    eurValue: number;
    sharePct: number;
  }[];
  stakingYtd: {
    year: number;
    totalEur: number;
    perCoin: { symbol: string; eurValue: number }[];
    freigrenzeEur: number;
    freigrenzeReached: boolean;
  };
};

export async function getCryptoSummary(ownerUserId: string): Promise<CryptoSummary> {
  const db = getDb();

  const [{ count: accountCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cryptoAccounts)
    .where(eq(cryptoAccounts.ownerUserId, ownerUserId));

  if (!accountCount) {
    return emptySummary();
  }

  const wallets = await db
    .select()
    .from(cryptoWallets)
    .where(eq(cryptoWallets.ownerUserId, ownerUserId))
    .orderBy(desc(cryptoWallets.nativeAmount));

  // EUR is the assumed reporting currency. If a wallet's native_balance
  // came back in another currency (rare — would require a non-EU Coinbase
  // locale), we ignore it here rather than apply a guess. Such rows would
  // separately show up as requires_review in transactions.
  const eurWallets = wallets.filter((w) => w.nativeCurrency === "EUR");
  const totalValueEur = eurWallets.reduce((a, w) => a + Number(w.nativeAmount), 0);

  const topHoldings = eurWallets
    .filter((w) => Number(w.nativeAmount) > 0.01)
    .slice(0, 8)
    .map((w) => ({
      symbol: w.symbol,
      name: w.name,
      quantity: Number(w.quantity),
      eurValue: Number(w.nativeAmount),
      sharePct: totalValueEur > 0 ? (Number(w.nativeAmount) / totalValueEur) * 100 : 0,
    }));

  const [{ lastSyncAt }] = await db
    .select({ lastSyncAt: sql<Date | null>`max(${cryptoAccounts.lastSyncAt})` })
    .from(cryptoAccounts)
    .where(eq(cryptoAccounts.ownerUserId, ownerUserId));

  const year = new Date().getUTCFullYear();
  const yearStart = `${year}-01-01`;

  const stakingRows = await db
    .select({
      symbol: transactions.symbol,
      total: sql<string>`coalesce(sum(${transactions.amountEur}), 0)`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.ownerUserId, ownerUserId),
        eq(transactions.eventType, "CRYPTO_STAKE_REWARD"),
        gte(transactions.eventDate, yearStart),
      ),
    )
    .groupBy(transactions.symbol)
    .orderBy(desc(sql`coalesce(sum(${transactions.amountEur}), 0)`));

  const perCoin = stakingRows
    .filter((r) => r.symbol !== null)
    .map((r) => ({ symbol: r.symbol as string, eurValue: Number(r.total) }));
  const stakingTotal = perCoin.reduce((a, r) => a + r.eurValue, 0);

  return {
    hasAccounts: true,
    totalValueEur,
    walletCount: eurWallets.length,
    lastSyncAt,
    topHoldings,
    stakingYtd: {
      year,
      totalEur: stakingTotal,
      perCoin,
      freigrenzeEur: FREIGRENZE_EUR,
      freigrenzeReached: stakingTotal >= FREIGRENZE_EUR,
    },
  };
}

function emptySummary(): CryptoSummary {
  return {
    hasAccounts: false,
    totalValueEur: 0,
    walletCount: 0,
    lastSyncAt: null,
    topHoldings: [],
    stakingYtd: {
      year: new Date().getUTCFullYear(),
      totalEur: 0,
      perCoin: [],
      freigrenzeEur: FREIGRENZE_EUR,
      freigrenzeReached: false,
    },
  };
}
