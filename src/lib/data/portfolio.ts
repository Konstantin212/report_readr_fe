import { and, asc, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { brokerAccounts, imports, taxReportLines, taxReports, transactions } from "@/lib/db/schema";
import type { Broker, EventType, NormalizedEvent } from "@/lib/domain/types";
import { buildLedgerSummary, type LedgerSummary } from "@/lib/ledger/summary";
import type { LegacyGermanTaxDraft as GermanTaxDraft } from "@/lib/tax/german-tax";
import { SAVER_ALLOWANCE_DEFAULT } from "@/lib/tax/constants";

export type StorageMode = "DATABASE" | "LOCAL";

export type OwnerTransactionEvent = NormalizedEvent & {
  transactionId: string;
  brokerAccountId: string | null;
  importId: string | null;
  eventFingerprint: string;
};

export type ImportHistoryItem = {
  id: string;
  broker: Broker;
  fileName: string;
  taxYear: number;
  eventCount: number;
  insertedEventCount: number;
  duplicateEventCount: number;
  statementStartDate: string | null;
  statementEndDate: string | null;
  createdAt: Date;
};

export type DashboardSummary = {
  storageMode: StorageMode;
  accountCount: number;
  totalEvents: number;
  latestImport?: ImportHistoryItem;
  ledger: LedgerSummary;
  reviewAlertCount: number;
};

export type PortfolioAccountSummary = {
  broker: Broker;
  accountNumber: string;
  baseCurrency: string;
  displayName: string | null;
  eventCount: number;
  ledger: LedgerSummary;
};

export type PortfolioSummary = {
  storageMode: StorageMode;
  accounts: PortfolioAccountSummary[];
};

export type ImportHistory = {
  storageMode: StorageMode;
  imports: ImportHistoryItem[];
};

export type TaxDraftSummary = {
  storageMode: StorageMode;
  // draft retained for legacy route compatibility; use loadTaxInputs + buildAnlageKap for new pages
  draft: GermanTaxDraft;
};

export type ReviewTransaction = OwnerTransactionEvent & {
  importFileName?: string;
};

export async function getOwnerTransactions(ownerUserId: string): Promise<OwnerTransactionEvent[]> {
  if (!hasDatabase()) {
    return [];
  }

  const rows = await getDb().select().from(transactions).where(eq(transactions.ownerUserId, ownerUserId)).orderBy(asc(transactions.eventDate));
  return rows.map(transactionRowToEvent);
}

export async function getDashboardSummary(ownerUserId: string): Promise<DashboardSummary> {
  if (!hasDatabase()) {
    return {
      storageMode: "LOCAL",
      accountCount: 0,
      totalEvents: 0,
      ledger: buildLedgerSummary([]),
      reviewAlertCount: 0,
    };
  }

  const [events, accounts, importHistory] = await Promise.all([
    getOwnerTransactions(ownerUserId),
    getDb().select().from(brokerAccounts).where(eq(brokerAccounts.ownerUserId, ownerUserId)),
    getImportHistory(ownerUserId),
  ]);
  const ledger = buildLedgerSummary(events);

  return {
    storageMode: "DATABASE",
    accountCount: accounts.length,
    totalEvents: events.length,
    latestImport: importHistory.imports[0],
    ledger,
    reviewAlertCount: events.filter((event) => event.requiresReview).length + ledger.reviewAlerts.length,
  };
}

export async function getPortfolioSummary(ownerUserId: string): Promise<PortfolioSummary> {
  if (!hasDatabase()) {
    return { storageMode: "LOCAL", accounts: [] };
  }

  const [accounts, events] = await Promise.all([
    getDb().select().from(brokerAccounts).where(eq(brokerAccounts.ownerUserId, ownerUserId)),
    getOwnerTransactions(ownerUserId),
  ]);

  return {
    storageMode: "DATABASE",
    accounts: accounts.map((account) => {
      const accountEvents = events.filter((event) => event.brokerAccountId === account.id);
      return {
        broker: account.broker,
        accountNumber: account.accountNumber,
        baseCurrency: account.baseCurrency,
        displayName: account.displayName,
        eventCount: accountEvents.length,
        ledger: buildLedgerSummary(accountEvents),
      };
    }),
  };
}

export async function getImportHistory(ownerUserId: string): Promise<ImportHistory> {
  if (!hasDatabase()) {
    return { storageMode: "LOCAL", imports: [] };
  }

  const rows = await getDb().select().from(imports).where(eq(imports.ownerUserId, ownerUserId)).orderBy(desc(imports.createdAt));
  return {
    storageMode: "DATABASE",
    imports: rows.map((row) => ({
      id: row.id,
      broker: row.broker,
      fileName: row.fileName,
      taxYear: row.taxYear,
      eventCount: row.eventCount,
      insertedEventCount: row.insertedEventCount,
      duplicateEventCount: row.duplicateEventCount,
      statementStartDate: row.statementStartDate,
      statementEndDate: row.statementEndDate,
      createdAt: row.createdAt,
    })),
  };
}

export async function getTaxDraft(ownerUserId: string, taxYear: number): Promise<TaxDraftSummary> {
  // Legacy shim: new pages should use loadTaxInputs + buildAnlageKap directly.
  const { buildAnlageKap } = await import("@/lib/tax/german-tax");
  const { loadTaxInputs } = await import("@/lib/data/tax");
  if (!hasDatabase()) {
    return {
      storageMode: "LOCAL",
      draft: buildAnlageKap({ taxYear, settings: { filingStatus: "SINGLE", saverAllowance: SAVER_ALLOWANCE_DEFAULT }, dividends: [], interest: [], matches: [] }),
    };
  }
  const inputs = await loadTaxInputs(ownerUserId, taxYear);
  const draft = buildAnlageKap(inputs);
  await persistTaxDraft(ownerUserId, draft);
  return { storageMode: "DATABASE", draft };
}

export async function getReviewTransactions(ownerUserId: string, taxYear?: number): Promise<ReviewTransaction[]> {
  if (!hasDatabase()) {
    return [];
  }

  const rows = await getDb()
    .select({
      transaction: transactions,
      importFileName: imports.fileName,
    })
    .from(transactions)
    .leftJoin(imports, eq(transactions.importId, imports.id))
    .where(and(eq(transactions.ownerUserId, ownerUserId), eq(transactions.requiresReview, true)))
    .orderBy(asc(transactions.eventDate));

  return rows
    .map((row) => ({
      ...transactionRowToEvent(row.transaction),
      ...(row.importFileName ? { importFileName: row.importFileName } : {}),
    }))
    .filter((event) => (taxYear ? event.date.startsWith(`${taxYear}-`) : true));
}

async function persistTaxDraft(ownerUserId: string, draft: GermanTaxDraft): Promise<void> {
  const db = getDb();
  const [report] = await db
    .insert(taxReports)
    .values({ ownerUserId, taxYear: draft.taxYear, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [taxReports.ownerUserId, taxReports.taxYear],
      set: { updatedAt: new Date() },
    })
    .returning({ id: taxReports.id });

  if (!report) {
    return;
  }

  for (const [lineKey, amount] of Object.entries(draft.lines)) {
    await db
      .insert(taxReportLines)
      .values({
        ownerUserId,
        taxReportId: report.id,
        lineKey,
        amount,
        currency: "EUR",
        evidence: draft.evidence,
      })
      .onConflictDoUpdate({
        target: [taxReportLines.taxReportId, taxReportLines.lineKey],
        set: {
          amount,
          evidence: draft.evidence,
        },
      });
  }
}

function transactionRowToEvent(row: typeof transactions.$inferSelect): OwnerTransactionEvent {
  return {
    id: row.id,
    transactionId: row.id,
    brokerAccountId: row.brokerAccountId,
    importId: row.importId,
    eventFingerprint: row.eventFingerprint,
    broker: row.broker,
    accountNumber: row.accountNumber,
    type: row.eventType as EventType,
    date: row.eventDate,
    currency: row.currency,
    symbol: row.symbol ?? undefined,
    isin: row.isin ?? undefined,
    description: row.description ?? undefined,
    quantity: row.quantity ?? undefined,
    price: row.price ?? undefined,
    amount: row.amount ?? undefined,
    amountEur: row.amountEur ?? undefined,
    cashAmount: row.cashAmount ?? undefined,
    cashAmountEur: row.cashAmountEur ?? undefined,
    proceeds: row.proceeds ?? undefined,
    proceedsEur: row.proceedsEur ?? undefined,
    fee: row.fee ?? undefined,
    feeEur: row.feeEur ?? undefined,
    realizedPnl: row.realizedPnl ?? undefined,
    realizedPnlEur: row.realizedPnlEur ?? undefined,
    withholdingTax: row.withholdingTax ?? undefined,
    withholdingTaxEur: row.withholdingTaxEur ?? undefined,
    fxSource:
      row.fxSource === "BROKER" || row.fxSource === "MANUAL_REVIEW" || row.fxSource === "MISSING"
        ? row.fxSource
        : undefined,
    requiresReview: row.requiresReview,
    reviewedAt: row.reviewedAt?.toISOString(),
    reviewedByUserId: row.reviewedByUserId ?? undefined,
    reviewNote: row.reviewNote ?? undefined,
    source: row.source ?? undefined,
  };
}

function hasDatabase(): boolean {
  if (!process.env.DATABASE_URL && process.env.VERCEL === "1") {
    throw new Error("DATABASE_URL is required on Vercel.");
  }

  return Boolean(process.env.DATABASE_URL);
}
