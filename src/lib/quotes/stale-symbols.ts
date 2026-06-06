import { inArray, max, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { positions, quoteCache } from "@/lib/db/schema";
import { EXTERNALLY_PRICED_SYMBOLS } from "./externally-priced";

/**
 * Pick the N held symbols whose cached spot price is most stale.
 *
 * The orchestrator can only safely refresh ~8 symbols per run on free
 * tiers (Twelve Data's 8/min cap is the binding constraint). To
 * eventually cover the whole portfolio when the user holds more than
 * that, the hourly cron asks for "the most-stale 8" each pass — over
 * a market day every symbol gets refreshed three or four times.
 *
 * Order: never-cached symbols first, then by ascending updated_at on
 * the most-recent quote_cache row for the symbol. Externally-priced
 * symbols (manual snapshots, etc.) are excluded — same filter the
 * cron already applies.
 */
export async function getStaleHeldSymbols(limit: number): Promise<string[]> {
  const db = getDb();
  const heldRows = await db.selectDistinct({ s: positions.symbol }).from(positions);
  const eligible = heldRows
    .map((x) => x.s)
    .filter((s): s is string => Boolean(s) && !EXTERNALLY_PRICED_SYMBOLS.has(s));
  if (!eligible.length) return [];

  const cacheRows = await db
    .select({ symbol: quoteCache.symbol, lastUpdated: max(quoteCache.updatedAt) })
    .from(quoteCache)
    .where(inArray(quoteCache.symbol, eligible))
    .groupBy(quoteCache.symbol);
  const lastBySymbol = new Map<string, Date | null>(cacheRows.map((r) => [r.symbol, r.lastUpdated]));

  // Sort: never-cached (null) first, then oldest updated_at ascending.
  const sorted = [...eligible].sort((a, b) => {
    const ta = lastBySymbol.get(a)?.getTime() ?? -Infinity;
    const tb = lastBySymbol.get(b)?.getTime() ?? -Infinity;
    return ta - tb;
  });
  return sorted.slice(0, limit);
}

// Re-export so callers don't need to know about the sql tag.
export { sql };
