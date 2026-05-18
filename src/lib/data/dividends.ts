import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";

export type DividendRow = {
  date: string;
  symbol: string | null;
  currency: string;
  amount: number;
  whtEur: number;
};

export async function getDividends(ownerUserId: string): Promise<{ rows: DividendRow[]; totalEur: number; whtTotalEur: number }> {
  const db = getDb();
  const txs = await db.select().from(transactions).where(
    and(eq(transactions.ownerUserId, ownerUserId), eq(transactions.eventType, "DIVIDEND")),
  );
  const rows = txs.map(t => ({
    date: t.eventDate,
    symbol: t.symbol,
    currency: t.currency,
    amount: Number(t.amountEur ?? 0),
    whtEur: Number(t.withholdingTaxEur ?? 0),
  })).sort((a, b) => b.date.localeCompare(a.date));
  const totalEur = rows.reduce((s, r) => s + r.amount, 0);
  const whtTotalEur = rows.reduce((s, r) => s + r.whtEur, 0);
  return { rows, totalEur, whtTotalEur };
}
