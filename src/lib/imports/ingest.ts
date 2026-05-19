import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { ingestPayloadSchema, type IngestPayload } from "@/lib/domain/zod";
import { computeEventFingerprint } from "./fingerprint";
import { convertEventToEur } from "@/lib/ledger/fx";
import { replay } from "@/lib/ledger/replay";
import { derivePositions } from "@/lib/ledger/positions";
import type { NormalizedEvent } from "@/lib/domain/types";

type EventWithName = NormalizedEvent & { name?: string };

export type IngestSummary = {
  importId: string;
  duplicate: boolean;
  insertedCount: number;
  duplicateCount: number;
  reviewCount: number;
};

export async function ingestParsedImport(ownerUserId: string, raw: IngestPayload): Promise<IngestSummary> {
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

  // 4. Upsert instruments (distinct by isin) from parsed events
  const seenIsins = new Set<string>();
  for (const ev of payload.events) {
    const evWithName = ev as EventWithName;
    if (!evWithName.isin) continue;
    if (seenIsins.has(evWithName.isin)) continue;
    seenIsins.add(evWithName.isin);
    await db.insert(s.instruments)
      .values({
        ownerUserId,
        symbol: evWithName.symbol,
        isin: evWithName.isin,
        name: evWithName.name,
        currency: evWithName.currency,
      })
      .onConflictDoUpdate({
        target: [s.instruments.ownerUserId, s.instruments.isin],
        set: {
          symbol: evWithName.symbol,
          name: evWithName.name,
          currency: evWithName.currency,
        },
      });
  }

  // 5. Insert events with ON CONFLICT DO NOTHING (fingerprint-based dedup).
  // Bulk-chunked: a Freedom24 statement can ship ~800 events and the old
  // one-INSERT-per-event loop blew past the 60 s Hobby function limit.
  // Postgres caps parameters at 65 535; with ~24 columns per row we stay
  // comfortably under that at chunk size 500 (≈12 000 params per query).
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

  const CHUNK = 500;
  for (let i = 0; i < rowsToInsert.length; i += CHUNK) {
    const slice = rowsToInsert.slice(i, i + CHUNK);
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
