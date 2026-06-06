import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/server";
import { isAdminEmail } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/client";
import { positions, quoteCache } from "@/lib/db/schema";
import { fetchYahooQuote } from "@/lib/quotes/yahoo";
import { fetchStooqQuote } from "@/lib/quotes/stooq";
import { EXTERNALLY_PRICED_SYMBOLS } from "@/lib/quotes/externally-priced";

/**
 * Admin-triggered quote refresh. Same logic as the daily cron but
 * gated by isAdminEmail instead of the cron secret, so it can be hit
 * from the browser via a button in Settings → Currency & FX.
 *
 * Useful when a quote provider has just been gated (and the cron has
 * silently fallen behind) and the admin wants to force an immediate
 * resync without waiting for 21:00 UTC.
 */
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

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  if (!isAdminEmail(user.email)) return new Response("forbidden", { status: 403 });

  const db = getDb();
  const heldRows = await db.selectDistinct({ s: positions.symbol }).from(positions);
  const allHeld = heldRows.map((x) => x.s).filter(Boolean) as string[];
  if (!allHeld.length) {
    return NextResponse.json({ requested: [], inserted: [], unpriced: [], skipped: [], bySource: {} });
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
    requested: requested.length,
    inserted: inserted.length,
    unpriced,
    skipped: skipped.length,
    bySource,
    writeError,
  });
}
