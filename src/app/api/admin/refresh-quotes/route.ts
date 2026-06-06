import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/server";
import { isAdminEmail } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/client";
import { positions, quoteCache } from "@/lib/db/schema";
import { refreshQuotes } from "@/lib/quotes/refresh";
import { EXTERNALLY_PRICED_SYMBOLS } from "@/lib/quotes/externally-priced";

/**
 * Admin-triggered quote refresh. Same orchestrator as the daily cron
 * (lib/quotes/refresh.ts) but gated by isAdminEmail instead of the
 * cron secret, so it can be hit from the Settings page via the
 * "Refresh quotes" button.
 *
 * Useful when a quote provider has just been gated (and the cron has
 * silently fallen behind) and the admin wants an immediate resync
 * without waiting for 21:00 UTC.
 */
export const maxDuration = 60;

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  if (!isAdminEmail(user.email)) return new Response("forbidden", { status: 403 });

  const db = getDb();
  const heldRows = await db.selectDistinct({ s: positions.symbol }).from(positions);
  const allHeld = heldRows.map((x) => x.s).filter(Boolean) as string[];
  if (!allHeld.length) {
    return NextResponse.json({ requested: 0, inserted: 0, unpriced: [], skipped: 0, bySource: {} });
  }

  const skipped = allHeld.filter((s) => EXTERNALLY_PRICED_SYMBOLS.has(s));
  const requested = allHeld.filter((s) => !EXTERNALLY_PRICED_SYMBOLS.has(s));

  const { quotes, bySource, unpriced, fmpConfigured, twelveDataConfigured } = await refreshQuotes(requested);

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
    requested: requested.length,
    inserted: quotes.length,
    unpriced,
    skipped: skipped.length,
    bySource,
    fmpConfigured,
    twelveDataConfigured,
    writeError,
  });
}
