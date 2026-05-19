import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { quoteHistory } from "@/lib/db/schema";
import { fetchYahooHistory } from "./history";

/**
 * Backfill 2-year daily price history for each symbol. Runs sequentially
 * with a 700 ms throttle to stay under Yahoo's anonymous rate limit.
 *
 * Called from two places:
 *  - /api/imports/ingest as a fire-and-forget after a successful ingest
 *  - /api/admin/backfill-history as a manual rerun (secret- or session-gated)
 */
export async function backfillHistoryForSymbols(
  symbols: string[],
): Promise<{ inserted: number; errors: string[] }> {
  const unique = Array.from(new Set(symbols.filter(Boolean)));
  if (unique.length === 0) return { inserted: 0, errors: [] };
  const db = getDb();
  let inserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < unique.length; i++) {
    const symbol = unique[i];
    try {
      const latest = await db
        .select({ d: quoteHistory.date })
        .from(quoteHistory)
        .where(eq(quoteHistory.symbol, symbol))
        .orderBy(desc(quoteHistory.date))
        .limit(1);
      const have = latest[0]?.d ?? "1970-01-01";
      const rows = await fetchYahooHistory(symbol, "2y");
      const fresh = rows.filter((r) => r.date > have);
      for (let j = 0; j < fresh.length; j += 200) {
        await db.insert(quoteHistory).values(fresh.slice(j, j + 200)).onConflictDoNothing();
      }
      inserted += fresh.length;
    } catch (err) {
      errors.push(`${symbol}: ${(err as Error).message}`);
    }
    if (i < unique.length - 1) {
      await new Promise((r) => setTimeout(r, 700));
    }
  }
  return { inserted, errors };
}
