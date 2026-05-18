import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { positions, quoteCache } from "@/lib/db/schema";
import { fetchYahooQuotes } from "@/lib/quotes/yahoo";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const db = getDb();
  const rows = await db.selectDistinct({ s: positions.symbol }).from(positions);
  const list = rows.map(x => x.s);
  if (!list.length) return NextResponse.json({ inserted: 0 });
  const quotes = await fetchYahooQuotes(list);
  for (const q of quotes) {
    await db.insert(quoteCache).values(q).onConflictDoUpdate({
      target: [quoteCache.symbol, quoteCache.date],
      set: { close: q.close, updatedAt: new Date() },
    });
  }
  return NextResponse.json({ inserted: quotes.length });
}
