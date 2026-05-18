import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { positions, quoteCache, quoteHistory, userSettings } from "@/lib/db/schema";
import { fetchYahooQuotes } from "@/lib/quotes/yahoo";
import { fetchYahooHistory } from "@/lib/quotes/history";

export const maxDuration = 300;

const BENCHMARK_DEFAULT = "^GSPC";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const db = getDb();

  const heldRows = await db.selectDistinct({ s: positions.symbol }).from(positions);
  const heldSymbols = heldRows.map(x => x.s).filter(Boolean);

  const benchRows = await db.selectDistinct({ s: userSettings.benchmarkSymbol }).from(userSettings);
  const benchmarkSymbols = benchRows.map(x => x.s).filter(Boolean);
  if (benchmarkSymbols.length === 0) benchmarkSymbols.push(BENCHMARK_DEFAULT);

  const universe = Array.from(new Set([...heldSymbols, ...benchmarkSymbols]));

  let spotInserted = 0;
  let spotError: string | null = null;
  if (heldSymbols.length) {
    try {
      const quotes = await fetchYahooQuotes(heldSymbols);
      for (const q of quotes) {
        await db.insert(quoteCache).values(q).onConflictDoUpdate({
          target: [quoteCache.symbol, quoteCache.date],
          set: { close: q.close, updatedAt: new Date() },
        });
      }
      spotInserted = quotes.length;
    } catch (err) {
      spotError = (err as Error).message;
    }
  }

  let historyInserted = 0;
  const historyErrors: string[] = [];
  for (let idx = 0; idx < universe.length; idx++) {
    const symbol = universe[idx];
    try {
      const latest = await db
        .select({ d: quoteHistory.date })
        .from(quoteHistory)
        .where(eq(quoteHistory.symbol, symbol))
        .orderBy(desc(quoteHistory.date))
        .limit(1);
      const have = latest[0]?.d ?? "1970-01-01";
      const today = new Date().toISOString().slice(0, 10);
      if (have >= today) continue;

      const rows = await fetchYahooHistory(symbol, "2y");
      const fresh = rows.filter(r => r.date > have);
      if (fresh.length === 0) continue;
      for (let i = 0; i < fresh.length; i += 200) {
        const chunk = fresh.slice(i, i + 200);
        await db.insert(quoteHistory).values(chunk).onConflictDoNothing();
      }
      historyInserted += fresh.length;
    } catch (err) {
      historyErrors.push(`${symbol}: ${(err as Error).message}`);
    }
    // throttle: 700 ms between symbols to avoid Yahoo 429
    if (idx < universe.length - 1) {
      await new Promise((r) => setTimeout(r, 700));
    }
  }

  return NextResponse.json({
    spotInserted,
    spotError,
    historyInserted,
    historyErrors,
    universe: universe.length,
  });
}
