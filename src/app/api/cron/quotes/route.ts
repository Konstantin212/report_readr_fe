import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { quoteCache } from "@/lib/db/schema";
import { refreshQuotes } from "@/lib/quotes/refresh";
import { getStaleHeldSymbols } from "@/lib/quotes/stale-symbols";
import { hasValidCronSecret } from "@/lib/auth/cron";

/**
 * Spot-quotes cron. Refreshes the N most-stale held symbols each run.
 *
 * On free tiers TD's 8/min cap and FMP's per-symbol paywall make
 * "fetch everything in one shot" unreliable (we get back ~13/20 and
 * the rest silently stay on yesterday's close). Instead, run hourly
 * during market hours and ask for the 8 oldest-cached symbols each
 * pass — over a market day every symbol gets refreshed 3-4 times even
 * for portfolios of 20+ holdings.
 *
 * Provider priority (in lib/quotes/refresh.ts):
 *   1. FMP per-symbol (US tickers FMP free knows)
 *   2. Twelve Data batched (international + FMP misses)
 *   3. Yahoo / Stooq fallbacks (blocked from Vercel IPs but kept for
 *      local dev parity)
 */
export const maxDuration = 60;

const PAGE_SIZE = 8;

export async function GET(req: Request) {
  if (!hasValidCronSecret(req)) {
    return new Response("unauthorized", { status: 401 });
  }

  const targets = await getStaleHeldSymbols(PAGE_SIZE);
  if (!targets.length) {
    return NextResponse.json({ requested: [], inserted: [], unpriced: [], bySource: {} });
  }

  const { quotes, bySource, unpriced, fmpConfigured, twelveDataConfigured } = await refreshQuotes(targets);

  const db = getDb();
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
            updatedAt: new Date(),
          },
        });
    } catch (e) {
      writeError = (e as Error).message;
    }
  }
  return NextResponse.json({
    requested: targets,
    inserted: quotes.map((q) => q.symbol),
    unpriced,
    bySource,
    fmpConfigured,
    twelveDataConfigured,
    writeError,
  });
}
