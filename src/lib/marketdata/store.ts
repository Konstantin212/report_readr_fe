/**
 * Persistence adapter (Repository) for the market-data layer. This is
 * the ONLY module in `src/lib/marketdata/` allowed to import the DB
 * client or Drizzle schema — providers, router, and the pure core stay
 * I/O-free. Consumers (classification, enrich, cron) go through here.
 */
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { instrumentMeta, instruments, positions as positionsTable, quoteCache } from "@/lib/db/schema";
import type { AssetKind, FundSubtype } from "@/lib/analytics/sector-map";
import type {
  DistributionPolicy,
  InstrumentMeta,
  InstrumentMetaFields,
  InstrumentRef,
  MetaSource,
  MetaStatus,
} from "./types";
import { isSyntheticIsin } from "./types";

type MetaRow = typeof instrumentMeta.$inferSelect;

/** Map a raw Drizzle row to the plain domain type (Dates → ISO strings). */
function toDomain(r: MetaRow): InstrumentMeta {
  return {
    isin: r.isin,
    status: r.status as MetaStatus,
    source: (r.source as MetaSource | null) ?? null,
    assetKind: (r.assetKind as AssetKind | null) ?? null,
    manualUrl: r.manualUrl ?? null,
    failCount: r.failCount,
    scrapedAt: r.scrapedAt ? r.scrapedAt.toISOString() : null,
    updatedAt: r.updatedAt.toISOString(),
    name: r.name ?? null,
    sector: r.sector ?? null,
    industry: r.industry ?? null,
    yahooSymbol: r.yahooSymbol ?? null,
    yahooQuoteSymbol: r.yahooQuoteSymbol ?? null,
    justetfTicker: r.justetfTicker ?? null,
    wkn: r.wkn ?? null,
    fundCurrency: r.fundCurrency ?? null,
    domicile: r.domicile ?? null,
    indexName: r.indexName ?? null,
    investmentFocus: r.investmentFocus ?? null,
    replication: r.replication ?? null,
    terPct: r.terPct ?? null,
    distributionPolicy: (r.distributionPolicy as DistributionPolicy | null) ?? null,
    distributionFrequency: r.distributionFrequency ?? null,
    teilfreistellungPct: r.teilfreistellungPct ?? null,
    fundSubtype: (r.fundSubtype as FundSubtype | null) ?? null,
  };
}

export type UpsertMetaInput = {
  isin: string;
  status: MetaStatus;
  source?: MetaSource | null;
  assetKind?: AssetKind | null;
  fields?: Partial<InstrumentMetaFields>;
  manualUrl?: string | null;
  raw?: unknown;
  error?: string | null;
  /** true on a successful scrape: stamps scrapedAt=now, resets failCount. */
  markScraped?: boolean;
  /** true on ERROR: increments failCount (starts at 1 for a fresh row). */
  bumpFailCount?: boolean;
};

/**
 * Insert-or-update one metadata row. Builds a partial values object so
 * only the columns a provider actually filled get written; on conflict
 * the same columns update. failCount uses SQL so a concurrent-safe
 * increment works without a read-modify-write.
 */
export async function upsertMeta(input: UpsertMetaInput): Promise<void> {
  const db = getDb();
  const f = input.fields ?? {};
  const now = new Date();

  const base = {
    status: input.status,
    source: input.source ?? undefined,
    assetKind: input.assetKind ?? undefined,
    name: f.name ?? undefined,
    sector: f.sector ?? undefined,
    industry: f.industry ?? undefined,
    yahooSymbol: f.yahooSymbol ?? undefined,
    yahooQuoteSymbol: f.yahooQuoteSymbol ?? undefined,
    justetfTicker: f.justetfTicker ?? undefined,
    wkn: f.wkn ?? undefined,
    fundCurrency: f.fundCurrency ?? undefined,
    domicile: f.domicile ?? undefined,
    indexName: f.indexName ?? undefined,
    investmentFocus: f.investmentFocus ?? undefined,
    replication: f.replication ?? undefined,
    terPct: f.terPct ?? undefined,
    distributionPolicy: f.distributionPolicy ?? undefined,
    distributionFrequency: f.distributionFrequency ?? undefined,
    teilfreistellungPct: f.teilfreistellungPct ?? undefined,
    fundSubtype: f.fundSubtype ?? undefined,
    manualUrl: input.manualUrl ?? undefined,
    raw: input.raw !== undefined ? (input.raw as object) : undefined,
    lastError: input.error ?? undefined,
    scrapedAt: input.markScraped ? now : undefined,
    updatedAt: now,
  };

  await db
    .insert(instrumentMeta)
    .values({
      isin: input.isin,
      failCount: input.bumpFailCount ? 1 : 0,
      ...base,
    })
    .onConflictDoUpdate({
      target: instrumentMeta.isin,
      set: {
        ...base,
        failCount: input.markScraped
          ? 0
          : input.bumpFailCount
            ? sql`${instrumentMeta.failCount} + 1`
            : undefined,
      },
    });
}

export async function getMetaByIsins(isins: string[]): Promise<InstrumentMeta[]> {
  if (!isins.length) return [];
  const db = getDb();
  const rows = await db.select().from(instrumentMeta).where(inArray(instrumentMeta.isin, isins));
  return rows.map(toDomain);
}

export async function getAllMeta(): Promise<InstrumentMeta[]> {
  const db = getDb();
  const rows = await db.select().from(instrumentMeta);
  return rows.map(toDomain);
}

/**
 * Distinct held instruments as enrichment refs. With `ownerUserId` →
 * that user's holdings (for classification override / post-upload
 * enrichment); without → every held instrument across users (for the
 * cron). Only rows with a non-null ISIN are returned.
 */
export async function getHeldRefs(ownerUserId?: string): Promise<InstrumentRef[]> {
  const db = getDb();
  const rows = await db
    .select({
      symbol: positionsTable.symbol,
      isin: positionsTable.isin,
      currency: positionsTable.currency,
    })
    .from(positionsTable)
    .where(
      ownerUserId
        ? and(eq(positionsTable.ownerUserId, ownerUserId), isNotNull(positionsTable.isin))
        : isNotNull(positionsTable.isin),
    );
  const seen = new Set<string>();
  const out: InstrumentRef[] = [];
  for (const r of rows) {
    if (!r.isin || !r.symbol) continue;
    const key = `${r.isin}|${r.symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ isin: r.isin, symbol: r.symbol, currency: r.currency ?? null });
  }
  return out;
}

/**
 * Map real ISIN → user's symbol(s), for fanning a single ISIN quote out
 * to every symbol the user holds under it (AC-8.2). Uses the per-user
 * `instruments` table (never a provider's own ticker).
 */
export async function getSymbolsByIsin(isin: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ symbol: instruments.symbol })
    .from(instruments)
    .where(eq(instruments.isin, isin));
  const set = new Set<string>();
  for (const r of rows) if (r.symbol) set.add(r.symbol);
  return [...set];
}

/**
 * The user's instrument rows (symbol + isin) — the ISIN↔symbol bridge
 * that `buildClassificationOverrides` joins against global metadata.
 */
export async function getUserInstruments(
  ownerUserId: string,
): Promise<{ symbol: string | null; isin: string | null; kind: string | null }[]> {
  const db = getDb();
  return db
    .select({ symbol: instruments.symbol, isin: instruments.isin, kind: instruments.kind })
    .from(instruments)
    .where(eq(instruments.ownerUserId, ownerUserId));
}

/** Upsert EOD quotes into quote_cache, labelling the source. */
export async function writeQuotes(
  quotes: { symbol: string; date: string; close: string; currency: string; source: string }[],
): Promise<void> {
  if (!quotes.length) return;
  const db = getDb();
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
}

export { isSyntheticIsin };
