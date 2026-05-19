import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { quoteHistory, positions } from "@/lib/db/schema";

/**
 * Diagnostic: shape of the quote_history table — total row count, distinct
 * symbols, date range, and held positions to compare against. Used to
 * sanity-check why the Performance page is showing empty curves.
 */
export async function GET() {
  const db = getDb();
  const total = await db.select({ c: sql<number>`count(*)::int` }).from(quoteHistory);
  const distinct = await db.select({ symbol: quoteHistory.symbol }).from(quoteHistory).groupBy(quoteHistory.symbol);
  const range = await db.select({
    min: sql<string>`min(${quoteHistory.date})`,
    max: sql<string>`max(${quoteHistory.date})`,
  }).from(quoteHistory);
  const held = await db.selectDistinct({ s: positions.symbol }).from(positions);
  return NextResponse.json({
    totalHistoryRows: total[0]?.c ?? 0,
    distinctSymbolsInHistory: distinct.map(d => d.symbol),
    historyDateRange: range[0],
    heldSymbols: held.map(h => h.s).filter(Boolean),
  });
}
