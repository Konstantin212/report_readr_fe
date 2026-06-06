import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { positions, quoteCache } from "@/lib/db/schema";
import { refreshQuotes } from "@/lib/quotes/refresh";
import { EXTERNALLY_PRICED_SYMBOLS } from "@/lib/quotes/externally-priced";
import { hasValidCronSecret } from "@/lib/auth/cron";

// Daily spot-quotes cron. Provider priority lives in lib/quotes/refresh:
//   1. Twelve Data (when TWELVE_DATA_API_KEY is set) — works from
//      data-center IPs, free tier, batched (8 symbols/call).
//   2. Yahoo v8 chart — works locally; data-center IPs often get
//      "Unauthorized".
//   3. Stooq — silently bot-challenged mid-2026; kept around in case
//      they revert.
// The orchestrator is shared with /api/admin/refresh-quotes so the
// behavior of the daily run and the manual button stays identical.
export const maxDuration = 60;

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

  const { quotes, bySource, unpriced } = await refreshQuotes(requested);

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
  return NextResponse.json({
    requested,
    inserted: quotes.map((q) => q.symbol),
    unpriced,
    skipped,
    bySource,
    writeError,
  });
}
