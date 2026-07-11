import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/server";
import { isAdminEmail } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/client";
import { positions, quoteCache } from "@/lib/db/schema";
import { refreshQuotes } from "@/lib/quotes/refresh";
import { EXTERNALLY_PRICED_SYMBOLS } from "@/lib/quotes/externally-priced";
import { getHeldRefs, getMetaByIsins } from "@/lib/marketdata/store";
import { enrichInstruments } from "@/lib/marketdata/enrich";

/**
 * Admin-triggered "reprice everything now". Two phases:
 *
 *   1. Enrich every held instrument that carries an ISIN, so EU ETFs get
 *      a justETF classification (and the quote path can route them) and
 *      stocks get Yahoo/FMP metadata. Because this is an explicit admin
 *      action (not the polite daily sweep), we pass the full ref count as
 *      the limit to bypass the cron's 5/run cap — `selectCandidates` still
 *      honours the 30-day TTL + error backoff, so already-fresh rows are
 *      skipped and re-runs stay cheap.
 *   2. Reprice all held symbols with the SAME router-driven provider
 *      selection the cron uses (isinBySymbol + metaByIsin) so ETFs price
 *      off justETF's EUR endpoint instead of a guessed Yahoo ticker.
 *
 * Gated by isAdminEmail (Settings → "Refresh quotes" button), not the
 * cron secret. maxDuration stays at the Hobby-plan ceiling (60s); the
 * enrichment runs at a tighter 500ms spacing (vs the cron's polite
 * 1.5s) so a full held-portfolio enrich + reprice fits the budget.
 * Already-enriched ISINs are TTL-skipped, so a second click (if a very
 * large portfolio didn't finish in one pass) is mostly fast repricing.
 */
export const maxDuration = 60;

const ADMIN_ENRICH_SPACING_MS = 500;

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  if (!isAdminEmail(user.email)) return new Response("forbidden", { status: 403 });

  const db = getDb();

  // Phase 1 — enrich all held ISINs (bypass the polite per-run cap).
  const refs = await getHeldRefs();
  const enrichment = refs.length
    ? await enrichInstruments(refs, refs.length, ADMIN_ENRICH_SPACING_MS)
    : { attempted: 0, ok: 0, notFound: 0, errors: 0 };

  // Phase 2 — reprice every held symbol with router-driven selection.
  const heldRows = await db.selectDistinct({ s: positions.symbol }).from(positions);
  const allHeld = heldRows.map((x) => x.s).filter(Boolean) as string[];
  if (!allHeld.length) {
    return NextResponse.json({ enrichment, requested: 0, inserted: 0, unpriced: [], skipped: 0, bySource: {} });
  }

  const skipped = allHeld.filter((s) => EXTERNALLY_PRICED_SYMBOLS.has(s));
  const requested = allHeld.filter((s) => !EXTERNALLY_PRICED_SYMBOLS.has(s));

  const isinBySymbol = new Map<string, string>();
  for (const r of refs) isinBySymbol.set(r.symbol, r.isin);
  const metas = await getMetaByIsins([...new Set(refs.map((r) => r.isin))]);
  const metaByIsin = new Map(metas.map((m) => [m.isin, m]));

  const { quotes, bySource, unpriced, attempts, fmpConfigured } = await refreshQuotes(requested, {
    isinBySymbol,
    metaByIsin,
  });

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
            source: sql`excluded.source`,
            updatedAt: new Date(),
          },
        });
    } catch (e) {
      writeError = (e as Error).message;
    }
  }
  return NextResponse.json({
    enrichment,
    requested: requested.length,
    inserted: quotes.length,
    unpriced,
    skipped: skipped.length,
    bySource,
    // Per-provider trace so an unpriced symbol shows which provider failed on
    // which listing. Failures first (that's what we're diagnosing).
    attempts: [...attempts].sort((a, b) => Number(a.ok) - Number(b.ok)),
    fmpConfigured,
    writeError,
  });
}
