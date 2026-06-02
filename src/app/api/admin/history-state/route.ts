import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { quoteHistory, positions } from "@/lib/db/schema";
import { hasValidCronSecret } from "@/lib/auth/cron";

/**
 * Inventory of what `quote_history` has versus what the user holds.
 * Used by `scripts/refresh_history.py` to figure out which symbols need
 * a backfill push, but also handy as a plain diagnostic of the table.
 *
 * Returns: total row count, per-symbol coverage (count + latest date)
 * for every held symbol, and the global held set.
 *
 * Auth: Bearer CRON_SECRET (read-only but consistent with the rest of
 * the admin API).
 */
export async function GET(req: Request) {
  if (!hasValidCronSecret(req)) {
    return new Response("unauthorized", { status: 401 });
  }
  const db = getDb();

  const total = await db.select({ c: sql<number>`count(*)::int` }).from(quoteHistory);
  const perSymbol = await db
    .select({
      symbol: quoteHistory.symbol,
      rows: sql<number>`count(*)::int`,
      latest: sql<string>`max(${quoteHistory.date})`,
    })
    .from(quoteHistory)
    .groupBy(quoteHistory.symbol);
  const heldRows = await db.selectDistinct({ s: positions.symbol }).from(positions);
  const held = heldRows.map((h) => h.s).filter(Boolean) as string[];

  const bySymbol = new Map(perSymbol.map((p) => [p.symbol, { rows: p.rows, latest: p.latest }]));
  const coverage = held.map((sym) => {
    const c = bySymbol.get(sym);
    return {
      symbol: sym,
      rows: c?.rows ?? 0,
      latestDate: c?.latest ?? null,
    };
  });
  return NextResponse.json({
    totalHistoryRows: total[0]?.c ?? 0,
    held,
    coverage,
  });
}
