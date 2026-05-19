import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { positions, quoteCache } from "@/lib/db/schema";
import { fetchStooqQuotes } from "@/lib/quotes/stooq";
import { fetchYahooSpots, YAHOO_PRIMARY_SYMBOLS } from "@/lib/quotes/yahoo-spot";

// Daily cron is spot-quotes only. Stooq covers most symbols at zero cost
// and no rate limit; Yahoo is used as the primary source for a tiny
// allow-list of symbols where Stooq lacks the user's actual exchange
// listing (today: just IEMM on Amsterdam). History backfill is separate.
export const maxDuration = 60;

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const db = getDb();
  const heldRows = await db.selectDistinct({ s: positions.symbol }).from(positions);
  const list = heldRows.map((x) => x.s).filter(Boolean) as string[];
  if (!list.length) return NextResponse.json({ requested: [], inserted: [], unpriced: [], writeError: null });

  // Route symbols to their preferred provider.
  const yahooList = list.filter((s) => YAHOO_PRIMARY_SYMBOLS.has(s));
  const stooqList = list.filter((s) => !YAHOO_PRIMARY_SYMBOLS.has(s));

  const [stooqQuotes, yahooResult] = await Promise.all([
    fetchStooqQuotes(stooqList),
    fetchYahooSpots(yahooList),
  ]);

  // If Yahoo failed for a primary-Yahoo symbol, fall back to Stooq for it
  // (e.g. EIMI.uk for IEMM). Better an approximation than no data.
  const yahooFailed = yahooList.filter((s) => !yahooResult.quotes.find((q) => q.symbol === s));
  const stooqFallback = yahooFailed.length ? await fetchStooqQuotes(yahooFailed) : [];

  const quotes = [...stooqQuotes, ...yahooResult.quotes, ...stooqFallback];
  let writeError: string | null = null;
  if (quotes.length) {
    try {
      await db
        .insert(quoteCache)
        .values(quotes)
        .onConflictDoUpdate({
          target: [quoteCache.symbol, quoteCache.date],
          // Update currency too — same symbol can flip provider (Stooq GBP
          // ↔ Yahoo EUR for IEMM) and the cached currency must follow.
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
  const inserted = quotes.map((q) => q.symbol);
  const unpriced = list.filter((s) => !inserted.includes(s));
  const responseBody = {
    requested: list,
    inserted,
    unpriced,
    yahooRequested: yahooList,
    yahooUsed: yahooResult.quotes.map((q) => ({ symbol: q.symbol, currency: q.currency, close: q.close, date: q.date })),
    yahooErrors: yahooResult.errors,
    writeError,
  };
  // Surface to Vercel runtime logs so we can diagnose without the caller
  // having to copy/paste the response body.
  console.log("[cron/quotes]", JSON.stringify(responseBody));
  return NextResponse.json(responseBody);
}
