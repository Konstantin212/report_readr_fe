import { NextResponse } from "next/server";
import { inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { instruments, quoteCache } from "@/lib/db/schema";
import { refreshQuotes } from "@/lib/quotes/refresh";
import { getStaleHeldSymbols } from "@/lib/quotes/stale-symbols";
import { getMetaByIsins } from "@/lib/marketdata/store";
import { sweepHeldMetadata } from "@/lib/marketdata/enrich";
import { hasValidCronSecret } from "@/lib/auth/cron";

/**
 * Spot-quotes cron. Refreshes the N most-stale held symbols each run,
 * then sweeps a few metadata rows for TTL freshness.
 *
 * Rather than "fetch everything in one shot" (unreliable on free tiers),
 * run hourly during market hours and ask for the 8 oldest-cached symbols
 * each pass — over a market day every symbol gets refreshed 3-4 times
 * even for portfolios of 20+ holdings.
 *
 * Provider routing lives in lib/quotes/refresh.ts: the router prices
 * owned ETFs off justETF and US/other listings off FMP→Yahoo. We supply
 * the symbol→ISIN map + persisted metadata so the router can make that
 * call; symbols with no ISIN fall back to the raw FMP→Yahoo path.
 */
export const maxDuration = 60;

const PAGE_SIZE = 8;
const META_SWEEP_LIMIT = 5;

export async function GET(req: Request) {
  if (!hasValidCronSecret(req)) {
    return new Response("unauthorized", { status: 401 });
  }

  const targets = await getStaleHeldSymbols(PAGE_SIZE);
  if (!targets.length) {
    const meta = await sweepHeldMetadata(META_SWEEP_LIMIT);
    return NextResponse.json({ requested: [], inserted: [], unpriced: [], bySource: {}, meta });
  }

  const db = getDb();

  // Router inputs: user-independent symbol→ISIN mapping + persisted metadata.
  const instrRows = await db
    .selectDistinct({ symbol: instruments.symbol, isin: instruments.isin })
    .from(instruments)
    .where(inArray(instruments.symbol, targets));
  const isinBySymbol = new Map<string, string>();
  for (const r of instrRows) {
    if (r.symbol && r.isin && !isinBySymbol.has(r.symbol)) isinBySymbol.set(r.symbol, r.isin);
  }
  const isins = [...new Set(isinBySymbol.values())];
  const metaRows = await getMetaByIsins(isins);
  const metaByIsin = new Map(metaRows.map((m) => [m.isin, m]));

  const { quotes, bySource, unpriced, fmpConfigured } = await refreshQuotes(targets, {
    isinBySymbol,
    metaByIsin,
  });

  let writeError: string | null = null;
  if (quotes.length) {
    try {
      await db
        .insert(quoteCache)
        .values(quotes)
        .onConflictDoUpdate({
          target: [quoteCache.symbol, quoteCache.date],
          set: {
            close: sql`excluded.close`,
            currency: sql`excluded.currency`,
            source: sql`excluded.source`,
            updatedAt: new Date(),
          },
        });
    } catch (e) {
      writeError = (e as Error).message;
    }
  }

  // TTL metadata refresh (classification / fund facts), separate from pricing.
  const meta = await sweepHeldMetadata(META_SWEEP_LIMIT);

  return NextResponse.json({
    requested: targets,
    inserted: quotes.map((q) => q.symbol),
    unpriced,
    bySource,
    fmpConfigured,
    meta,
    writeError,
  });
}
