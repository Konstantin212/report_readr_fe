import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { positions, quoteCache } from "@/lib/db/schema";
import { EXTERNALLY_PRICED_SYMBOLS } from "@/lib/quotes/externally-priced";
import { hasValidCronSecret } from "@/lib/auth/cron";

/**
 * Lists every held symbol across all users that the local refresh script
 * should fetch on its next run. A symbol is "needed" when EITHER:
 *
 *  - it lives in EXTERNALLY_PRICED_SYMBOLS (Stooq cron never touches
 *    these — always needs an out-of-band refresh), OR
 *  - it has no row in quote_cache at all (the cron tried and failed,
 *    or the symbol is new).
 *
 * Stale-but-present quotes for Stooq-priced symbols are intentionally
 * NOT reported — the daily cron handles those. The script's job is to
 * fill gaps Vercel cannot fill, not to second-guess the cron.
 *
 * Auth: Bearer CRON_SECRET.
 */
export async function GET(req: Request) {
  if (!hasValidCronSecret(req)) {
    return new Response("unauthorized", { status: 401 });
  }
  const db = getDb();

  const heldRows = await db.selectDistinct({ s: positions.symbol }).from(positions);
  const held = heldRows.map((r) => r.s).filter(Boolean) as string[];

  const quoteRows = await db.select({ symbol: quoteCache.symbol, date: quoteCache.date }).from(quoteCache);
  const latestBySymbol = new Map<string, string>();
  for (const q of quoteRows) {
    const prev = latestBySymbol.get(q.symbol);
    if (!prev || q.date > prev) latestBySymbol.set(q.symbol, q.date);
  }

  const symbols = held
    .filter((s) => EXTERNALLY_PRICED_SYMBOLS.has(s) || !latestBySymbol.has(s))
    .map((s) => ({
      symbol: s,
      lastQuoteDate: latestBySymbol.get(s) ?? null,
      reason: EXTERNALLY_PRICED_SYMBOLS.has(s) ? "external_only" : "no_data",
    }));

  return NextResponse.json({ symbols });
}
