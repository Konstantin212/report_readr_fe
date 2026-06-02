import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { positions, quoteCache } from "@/lib/db/schema";
import { fetchStooqQuotes } from "@/lib/quotes/stooq";
import { EXTERNALLY_PRICED_SYMBOLS } from "@/lib/quotes/externally-priced";
import { hasValidCronSecret } from "@/lib/auth/cron";

// Daily spot-quotes cron. Stooq covers most symbols at zero cost and no
// rate limit. Symbols Yahoo blocks for our IP range — and Stooq lacks the
// correct listing for — are skipped here and refreshed by an out-of-band
// script (scripts/refresh_quotes.py) running on a residential IP.
export const maxDuration = 60;

export async function GET(req: Request) {
  if (!hasValidCronSecret(req)) {
    return new Response("unauthorized", { status: 401 });
  }
  const db = getDb();
  const heldRows = await db.selectDistinct({ s: positions.symbol }).from(positions);
  const allHeld = heldRows.map((x) => x.s).filter(Boolean) as string[];
  if (!allHeld.length) {
    return NextResponse.json({ requested: [], inserted: [], unpriced: [], skipped: [], writeError: null });
  }

  const skipped = allHeld.filter((s) => EXTERNALLY_PRICED_SYMBOLS.has(s));
  const stooqList = allHeld.filter((s) => !EXTERNALLY_PRICED_SYMBOLS.has(s));

  const quotes = await fetchStooqQuotes(stooqList);

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
  const unpriced = stooqList.filter((s) => !inserted.includes(s));
  return NextResponse.json({
    requested: stooqList,
    inserted,
    unpriced,
    skipped,
    writeError,
  });
}
