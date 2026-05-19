import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { positions, quoteCache } from "@/lib/db/schema";
import { fetchYahooQuotes } from "@/lib/quotes/yahoo";

// Daily cron is spot-quotes only — fits in ~3 s on Hobby's 60 s cap.
// Daily price history is backfilled at ingest time (and via
// /api/admin/backfill-history) so it never competes for runtime here.
export const maxDuration = 60;

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const db = getDb();
  const heldRows = await db.selectDistinct({ s: positions.symbol }).from(positions);
  const list = heldRows.map((x) => x.s).filter(Boolean);
  if (!list.length) return NextResponse.json({ spotInserted: 0 });

  let spotInserted = 0;
  let spotError: string | null = null;
  try {
    const quotes = await fetchYahooQuotes(list);
    for (const q of quotes) {
      await db
        .insert(quoteCache)
        .values(q)
        .onConflictDoUpdate({
          target: [quoteCache.symbol, quoteCache.date],
          set: { close: q.close, updatedAt: new Date() },
        });
    }
    spotInserted = quotes.length;
  } catch (err) {
    spotError = (err as Error).message;
  }
  return NextResponse.json({ spotInserted, spotError });
}
