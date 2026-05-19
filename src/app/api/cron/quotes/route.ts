import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { positions, quoteCache } from "@/lib/db/schema";
import { fetchStooqQuotes } from "@/lib/quotes/stooq";

// Daily cron is spot-quotes only via Stooq (no rate limits, no API key).
// History backfill happens at ingest + via /api/admin/backfill-history.
export const maxDuration = 60;

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const db = getDb();
  const heldRows = await db.selectDistinct({ s: positions.symbol }).from(positions);
  const list = heldRows.map((x) => x.s).filter(Boolean) as string[];
  if (!list.length) return NextResponse.json({ requested: [], inserted: [], unpriced: [] });

  const quotes = await fetchStooqQuotes(list);
  let writeError: string | null = null;
  if (quotes.length) {
    try {
      await db
        .insert(quoteCache)
        .values(quotes)
        .onConflictDoUpdate({
          target: [quoteCache.symbol, quoteCache.date],
          set: { close: sql`excluded.close`, updatedAt: new Date() },
        });
    } catch (e) {
      writeError = (e as Error).message;
    }
  }
  const inserted = quotes.map((q) => q.symbol);
  const unpriced = list.filter((s) => !inserted.includes(s));
  return NextResponse.json({ requested: list, inserted, unpriced, writeError });
}
