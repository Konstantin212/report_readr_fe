import { eq, and, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { ingestPayloadSchema } from "@/lib/domain/zod";
import { computeEventFingerprint } from "./fingerprint";
import { convertEventToEur } from "@/lib/ledger/fx";
import { replay } from "@/lib/ledger/replay";
import { derivePositions } from "@/lib/ledger/positions";
import { resolveInstrumentSymbols } from "./instrument-symbols";
import type { NormalizedEvent } from "@/lib/domain/types";

type EventWithName = NormalizedEvent & { name?: string };

export type IngestSummary = {
  importId: string;
  duplicate: boolean;
  insertedCount: number;
  duplicateCount: number;
  reviewCount: number;
};

export async function ingestParsedImport(ownerUserId: string, raw: unknown): Promise<IngestSummary> {
  const parsed = ingestPayloadSchema.safeParse(raw);
  if (!parsed.success) throw new Error("INVALID_PAYLOAD: " + parsed.error.message);
  const payload = parsed.data;
  const db = getDb();

  // 1. Upsert broker_accounts
  const ba = await db.insert(s.brokerAccounts).values({
    ownerUserId,
    broker: payload.broker,
    accountNumber: payload.account.accountNumber,
    baseCurrency: payload.account.baseCurrency ?? "EUR",
  }).onConflictDoUpdate({
    target: [s.brokerAccounts.ownerUserId, s.brokerAccounts.broker, s.brokerAccounts.accountNumber],
    set: { updatedAt: new Date() },
  }).returning();
  const brokerAccountId = ba[0].id;

  // 2. Duplicate file-hash check
  const existing = await db.select().from(s.imports)
    .where(and(eq(s.imports.ownerUserId, ownerUserId), eq(s.imports.fileHash, payload.fileHash)));
  if (existing.length) {
    return { importId: existing[0].id, duplicate: true, insertedCount: 0, duplicateCount: payload.events.length, reviewCount: 0 };
  }

  // 3. Load FX rates and build lookup map
  const rateRows = await db.select().from(s.fxRates);
  const rateMap = new Map(rateRows.map(r => [`${r.date}|${r.fromCurrency}`, r.rate]));

  // 4. Upsert instruments (distinct by isin) from parsed events.
  // Broker-declared kind rides on TRADE rows only (FF `instr_kind`, IBKR
  // FII), while the first event per ISIN is often a dividend — so collect
  // kind across ALL events first and only overwrite an existing kind when
  // this statement actually declares one.
  const kindByIsin = new Map<string, string>();
  for (const ev of payload.events) {
    const kind = (ev as { instrumentKind?: string }).instrumentKind;
    if (ev.isin && kind && !kindByIsin.has(ev.isin)) kindByIsin.set(ev.isin, kind);
  }
  // Resolve the CURRENT ticker per ISIN (rename-aware) rather than trusting
  // whichever event happens to be seen first — a renamed instrument must map
  // to its surviving, tradeable symbol so quotes don't die on the old ticker.
  const symbolByIsin = resolveInstrumentSymbols(payload.events);
  const seenIsins = new Set<string>();
  for (const ev of payload.events) {
    const evWithName = ev as EventWithName;
    if (!evWithName.isin) continue;
    if (seenIsins.has(evWithName.isin)) continue;
    seenIsins.add(evWithName.isin);
    const kind = kindByIsin.get(evWithName.isin);
    const symbol = symbolByIsin.get(evWithName.isin) ?? evWithName.symbol;
    await db.insert(s.instruments)
      .values({
        ownerUserId,
        symbol,
        isin: evWithName.isin,
        name: evWithName.name,
        currency: evWithName.currency,
        kind,
      })
      .onConflictDoUpdate({
        target: [s.instruments.ownerUserId, s.instruments.isin],
        set: {
          symbol,
          name: evWithName.name,
          currency: evWithName.currency,
          // Preserve a previously-learned kind when this statement has none.
          kind: kind ?? sql`${s.instruments.kind}`,
        },
      });
  }

  // 5. Insert events with ON CONFLICT DO NOTHING (fingerprint-based dedup).
  // Bulk-chunked: a Freedom24 statement can ship ~800 events and the old
  // one-INSERT-per-event loop blew past the 60 s Hobby function limit.
  // Postgres caps parameters at 65 535; with ~24 columns per row we stay
  // comfortably under that at chunk size 500 (≈12 000 params per query).
  //
  // Secondary "enriched-twin" guard: the fingerprint hashes symbol/isin/
  // source among other fields, so when a PARSER improvement starts filling
  // a previously-missing field (e.g. IBKR dividends gaining symbol+ISIN,
  // FF corporate actions gaining ISIN), a re-upload of the same statement
  // produces the same economic event with a NEW fingerprint — and the
  // constraint above happily inserts a duplicate (real incident: doubled
  // IBKR ETF dividends and a twice-applied SCHD split). For the enrichable
  // event types we therefore also skip rows whose (date, type, currency,
  // amount, description) already exists on this account. TRADE rows are
  // excluded from the guard: their content is stable and two identical
  // same-day trades are legitimate.
  const SOFT_DEDUP_TYPES = new Set(["DIVIDEND", "INTEREST", "WITHHOLDING_TAX", "CORPORATE_ACTION", "FEE"]);
  const softKey = (r: {
    eventDate: string;
    eventType: string;
    currency?: string | null;
    amount?: string | null;
    quantity?: string | null;
    description?: string | null;
  }) =>
    [r.eventDate, r.eventType, r.currency ?? "", r.amount ?? "", r.quantity ?? "", (r.description ?? "").trim()].join("|");
  const existingSoftKeys = new Set(
    (await db
      .select({
        eventDate: s.transactions.eventDate,
        eventType: s.transactions.eventType,
        currency: s.transactions.currency,
        amount: s.transactions.amount,
        quantity: s.transactions.quantity,
        description: s.transactions.description,
      })
      .from(s.transactions)
      .where(and(eq(s.transactions.ownerUserId, ownerUserId), eq(s.transactions.brokerAccountId, brokerAccountId))))
      .filter((r) => SOFT_DEDUP_TYPES.has(r.eventType))
      .map(softKey),
  );

  let insertedCount = 0;
  let reviewCount = 0;
  const rowsToInsert = payload.events.map((ev) => {
    const evWithName = ev as EventWithName;
    const enriched = convertEventToEur(ev as NormalizedEvent, rateMap);
    if (enriched.requiresReview) reviewCount++;
    const fingerprint = computeEventFingerprint(enriched);
    return {
      ownerUserId,
      brokerAccountId,
      broker: payload.broker,
      accountNumber: payload.account.accountNumber,
      eventFingerprint: fingerprint,
      eventType: ev.type,
      eventDate: ev.date,
      currency: ev.currency,
      symbol: ev.symbol,
      isin: ev.isin,
      name: evWithName.name,
      quantity: ev.quantity,
      price: ev.price,
      amount: ev.amount,
      amountEur: enriched.amountEur,
      cashAmount: ev.cashAmount,
      cashAmountEur: enriched.cashAmountEur,
      proceeds: ev.proceeds,
      proceedsEur: enriched.proceedsEur,
      fee: ev.fee,
      feeEur: enriched.feeEur,
      realizedPnl: ev.realizedPnl,
      realizedPnlEur: enriched.realizedPnlEur,
      withholdingTax: ev.withholdingTax,
      withholdingTaxEur: enriched.withholdingTaxEur,
      fxSource: enriched.fxSource,
      requiresReview: !!enriched.requiresReview,
      description: ev.description,
      source: ev.source,
      raw: ev as never,
    };
  });

  // Soft-skipped rows fall out of `insertedCount`, so they surface as
  // duplicates in the import summary — which is what they are.
  const softDeduped = rowsToInsert.filter((r) => {
    if (!SOFT_DEDUP_TYPES.has(r.eventType)) return true;
    return !existingSoftKeys.has(softKey(r));
  });

  const CHUNK = 500;
  for (let i = 0; i < softDeduped.length; i += CHUNK) {
    const slice = softDeduped.slice(i, i + CHUNK);
    const r = await db
      .insert(s.transactions)
      .values(slice)
      .onConflictDoNothing({
        target: [s.transactions.ownerUserId, s.transactions.brokerAccountId, s.transactions.eventFingerprint],
      })
      .returning({ id: s.transactions.id });
    insertedCount += r.length;
  }
  const duplicateCount = rowsToInsert.length - insertedCount;

  // 5. Audit row
  const imp = await db.insert(s.imports).values({
    ownerUserId,
    brokerAccountId,
    broker: payload.broker,
    fileName: payload.fileName,
    fileHash: payload.fileHash,
    taxYear: payload.taxYear,
    eventCount: payload.events.length,
    insertedEventCount: insertedCount,
    duplicateEventCount: duplicateCount,
    statementStartDate: payload.account.statementStartDate,
    statementEndDate: payload.account.statementEndDate,
    status: "PARSED",
  }).returning();

  // 6. Rebuild lots/matches/positions for this account
  await runReplayForAccount(ownerUserId, brokerAccountId);

  // 7. Seed quote_cache with the broker's end-of-statement spot prices.
  //    Critical for European UCITS ETFs (VHYL, VUSA, SPYW, XSX7, …) and
  //    Freedom-specific aliases (RY4C) that none of our free API
  //    providers can price. Live API quotes always carry today's date,
  //    so the orchestrator's "latest by date" pick still prefers the
  //    fresher API value when present; the snapshot is only the
  //    fallback for symbols nothing else can reach.
  if (payload.snapshotQuotes && payload.snapshotQuotes.length) {
    await db
      .insert(s.quoteCache)
      .values(payload.snapshotQuotes.map((q) => ({
        symbol: q.symbol,
        date: q.date,
        close: q.close,
        currency: q.currency,
        source: q.source,
      })))
      .onConflictDoUpdate({
        target: [s.quoteCache.symbol, s.quoteCache.date],
        set: {
          close: sql`excluded.close`,
          currency: sql`excluded.currency`,
          source: sql`excluded.source`,
          updatedAt: new Date(),
        },
      });
  }

  return { importId: imp[0].id, duplicate: false, insertedCount, duplicateCount, reviewCount };
}

export async function runReplayForAccount(ownerUserId: string, brokerAccountId: string): Promise<void> {
  const db = getDb();
  const rows = await db.select().from(s.transactions)
    .where(and(eq(s.transactions.ownerUserId, ownerUserId), eq(s.transactions.brokerAccountId, brokerAccountId)));
  const events: NormalizedEvent[] = rows.map(r => ({
    id: r.id,
    broker: r.broker,
    accountNumber: r.accountNumber,
    type: r.eventType,
    date: r.eventDate,
    currency: r.currency,
    symbol: r.symbol ?? undefined,
    isin: r.isin ?? undefined,
    quantity: r.quantity ?? undefined,
    amount: r.amount ?? undefined,
    amountEur: r.amountEur ?? undefined,
    fee: r.fee ?? undefined,
    feeEur: r.feeEur ?? undefined,
    // Replay's share-split handling keys off CORPORATE_ACTION descriptions
    // ("split") — without this field a DB-driven re-replay would silently
    // skip splits and corrupt FIFO bases (the SCHD 3:1 phantom-loss bug).
    description: r.description ?? undefined,
  }));
  const { lots, matches } = replay(events);

  await db.delete(s.lots).where(and(eq(s.lots.ownerUserId, ownerUserId), eq(s.lots.brokerAccountId, brokerAccountId)));
  if (lots.length) {
    await db.insert(s.lots).values(lots.map(l => ({
      ownerUserId,
      brokerAccountId,
      symbol: l.symbol,
      isin: l.isin ?? null,
      openedAt: l.openedAt,
      remainingQty: l.remainingQty,
      costEur: l.costEur,
      sourceEventFingerprint: l.sourceEventId,
    })));
  }
  await db.delete(s.realizedMatches).where(and(eq(s.realizedMatches.ownerUserId, ownerUserId), eq(s.realizedMatches.brokerAccountId, brokerAccountId)));
  if (matches.length) {
    await db.insert(s.realizedMatches).values(matches.map(m => ({
      ownerUserId,
      brokerAccountId,
      symbol: m.symbol,
      isin: m.isin ?? null,
      openingFingerprint: m.openingEventId,
      closingFingerprint: m.closingEventId,
      qty: m.qty,
      costEur: m.costEur,
      proceedsEur: m.proceedsEur,
      gainEur: m.gainEur,
      holdingDays: m.holdingDays,
      isLongTerm: m.isLongTerm,
      closedAt: m.closedAt,
    })));
  }

  const positions = derivePositions(lots);
  await db.delete(s.positions).where(and(eq(s.positions.ownerUserId, ownerUserId), eq(s.positions.brokerAccountId, brokerAccountId)));
  if (positions.length) {
    await db.insert(s.positions).values(positions.map(p => ({
      ownerUserId,
      brokerAccountId,
      symbol: p.symbol,
      isin: p.isin ?? null,
      currency: "EUR",
      quantity: p.quantity,
    })));
  }
}
