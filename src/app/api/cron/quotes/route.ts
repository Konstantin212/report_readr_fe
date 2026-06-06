import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { positions, quoteCache } from "@/lib/db/schema";
import { fetchYahooQuote } from "@/lib/quotes/yahoo";
import { fetchStooqQuote } from "@/lib/quotes/stooq";
import { EXTERNALLY_PRICED_SYMBOLS } from "@/lib/quotes/externally-priced";
import { hasValidCronSecret } from "@/lib/auth/cron";

// Daily spot-quotes cron. Yahoo's v8 chart endpoint is the primary
// source — it's the only free venue that still returns parseable JSON
// for unauthenticated callers after Stooq's mid-2026 bot challenge
// rollout and Yahoo's v7 quote endpoint's "Unauthorized" gate.
// Stooq remains as a fallback in case Yahoo throttles a specific
// symbol; the bot challenge there now returns null (see parseStooqCsv)
// instead of writing JS-blob substrings into the cache.
export const maxDuration = 60;

type Quote = { symbol: string; date: string; close: string; currency: string };

async function fetchWithFallback(symbol: string): Promise<{ quote: Quote | null; source: "yahoo" | "stooq" | "none" }> {
  try {
    const y = await fetchYahooQuote(symbol);
    if (y) return { quote: y, source: "yahoo" };
  } catch { /* fall through */ }
  try {
    const s = await fetchStooqQuote(symbol);
    if (s) return { quote: s, source: "stooq" };
  } catch { /* fall through */ }
  return { quote: null, source: "none" };
}

export async function GET(req: Request) {
  if (!hasValidCronSecret(req)) {
    return new Response("unauthorized", { status: 401 });
  }
  const db = getDb();
  const heldRows = await db.selectDistinct({ s: positions.symbol }).from(positions);
  const allHeld = heldRows.map((x) => x.s).filter(Boolean) as string[];
  if (!allHeld.length) {
    return NextResponse.json({ requested: [], inserted: [], unpriced: [], skipped: [], writeError: null, bySource: {} });
  }

  const skipped = allHeld.filter((s) => EXTERNALLY_PRICED_SYMBOLS.has(s));
  const requested = allHeld.filter((s) => !EXTERNALLY_PRICED_SYMBOLS.has(s));

  const results = await Promise.all(requested.map((s) => fetchWithFallback(s)));
  const quotes: Quote[] = [];
  const bySource: Record<string, number> = { yahoo: 0, stooq: 0, none: 0 };
  for (const r of results) {
    bySource[r.source] = (bySource[r.source] ?? 0) + 1;
    if (r.quote) quotes.push(r.quote);
  }

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
  const inserted = quotes.map((q) => q.symbol);
  const unpriced = requested.filter((s) => !inserted.includes(s));
  return NextResponse.json({
    requested,
    inserted,
    unpriced,
    skipped,
    bySource,
    writeError,
  });
}
