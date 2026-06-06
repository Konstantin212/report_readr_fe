import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { positions, quoteCache } from "@/lib/db/schema";

export type QuoteStatusRow = {
  symbol: string;
  /** Latest cached close in the quote's native currency, or null when the
   *  symbol has never been priced. */
  close: number | null;
  currency: string | null;
  /** The trading-day date the close belongs to ("2026-06-05"). */
  quoteDate: string | null;
  /** Last time the cron / button wrote to this symbol's cache row. */
  lastUpdated: Date | null;
};

/**
 * Per-symbol view of how fresh each held position's spot price is.
 * Used by the Settings → Tax & currency page to surface which symbols
 * the paged cron has refreshed recently vs which are still on an old
 * cache row (typically the ones FMP free paywalls and TD's 8/min cap
 * shoved into the next rotation window).
 *
 * Sorted stalest-first: never-cached symbols at the top, then by
 * ascending `lastUpdated` so the most-out-of-date entries stand out.
 */
export async function getQuoteStatus(ownerUserId: string): Promise<QuoteStatusRow[]> {
  const db = getDb();

  const heldRows = await db
    .selectDistinct({ s: positions.symbol })
    .from(positions)
    .where(eq(positions.ownerUserId, ownerUserId));
  const held = heldRows.map((x) => x.s).filter((s): s is string => Boolean(s));
  if (!held.length) return [];

  // Pull every cache row for these symbols, then pick the latest by
  // (date, updatedAt) per symbol in JS. quote_cache has at most ~100
  // rows per symbol so the IN-list query is cheap.
  const cacheRows = held.length
    ? await db
        .select({
          symbol: quoteCache.symbol,
          date: quoteCache.date,
          close: quoteCache.close,
          currency: quoteCache.currency,
          updatedAt: quoteCache.updatedAt,
        })
        .from(quoteCache)
        .where(inArray(quoteCache.symbol, held))
    : [];

  const latestBySymbol = new Map<string, typeof cacheRows[number]>();
  for (const r of cacheRows) {
    const prior = latestBySymbol.get(r.symbol);
    if (!prior || r.date > prior.date) latestBySymbol.set(r.symbol, r);
  }

  const out: QuoteStatusRow[] = held.map((s) => {
    const r = latestBySymbol.get(s);
    return {
      symbol: s,
      close: r ? Number(r.close) : null,
      currency: r?.currency ?? null,
      quoteDate: r?.date ?? null,
      lastUpdated: r?.updatedAt ?? null,
    };
  });

  // Stalest first: never-priced at the top, then by oldest quote date
  // ascending. We sort by `quoteDate` rather than `lastUpdated` because
  // the freshness chip in the UI reflects the age of the price itself —
  // a row updated today but holding last week's close is still stale.
  // Tiebreak by lastUpdated so symbols whose cron last touched them
  // earlier surface first within the same date bucket.
  out.sort((a, b) => {
    if (a.quoteDate === null && b.quoteDate !== null) return -1;
    if (b.quoteDate === null && a.quoteDate !== null) return 1;
    if (a.quoteDate !== b.quoteDate) return (a.quoteDate ?? "").localeCompare(b.quoteDate ?? "");
    const ta = a.lastUpdated?.getTime() ?? 0;
    const tb = b.lastUpdated?.getTime() ?? 0;
    return ta - tb;
  });

  return out;
}
