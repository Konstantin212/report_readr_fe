import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { quoteCache } from "@/lib/db/schema";
import { fetchYahooSpot } from "@/lib/quotes/yahoo-spot";

/**
 * Diagnostic: returns every quote_cache row for IEMM (latest first) plus a
 * live Yahoo probe from the same code path the cron uses. Lets us see
 * exactly what's stored and whether Yahoo is reachable from this Vercel
 * function — no log-mining required. Auth: cron-secret OR no auth at all
 * (it's read-only and just for IEMM).
 */
export async function GET() {
  const db = getDb();
  const rows = await db
    .select()
    .from(quoteCache)
    .where(eq(quoteCache.symbol, "IEMM"))
    .orderBy(desc(quoteCache.date));
  const probe = await fetchYahooSpot("IEMM");
  return NextResponse.json({
    storedRows: rows.map((r) => ({
      date: r.date,
      close: r.close,
      currency: r.currency,
      source: r.source,
      updatedAt: r.updatedAt,
    })),
    liveYahooProbe: probe,
  });
}
