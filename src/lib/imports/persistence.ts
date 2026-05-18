import { and, eq, type InferInsertModel } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { brokerAccounts, imports, transactions } from "@/lib/db/schema";
import type { NormalizedEvent, ParsedImport } from "@/lib/domain/types";
import { computeEventFingerprint } from "@/lib/imports/fingerprint";

type TransactionInsert = InferInsertModel<typeof transactions>;

export type PersistImportInput = {
  ownerUserId: string;
  parsed: ParsedImport;
  fileHash: string;
};

export type PersistImportResult = {
  persisted: boolean;
  duplicate: boolean;
  importId?: string;
  brokerAccountId?: string;
  insertedEventCount?: number;
  duplicateEventCount?: number;
};

export type ManualReviewValues = {
  amountEur?: string;
  realizedPnlEur?: string;
  feeEur?: string;
  withholdingTaxEur?: string;
  cashAmountEur?: string;
  reviewNote?: string;
};

export type ManualReviewUpdate = {
  ownerUserId: string;
  transactionId: string;
  set: Pick<
    TransactionInsert,
    | "amountEur"
    | "realizedPnlEur"
    | "feeEur"
    | "withholdingTaxEur"
    | "cashAmountEur"
    | "fxSource"
    | "requiresReview"
    | "reviewedAt"
    | "reviewedByUserId"
    | "reviewNote"
  >;
};

export async function persistParsedImport(input: PersistImportInput): Promise<PersistImportResult> {
  if (!process.env.DATABASE_URL) {
    if (process.env.VERCEL === "1") {
      throw new Error("DATABASE_URL is required to persist imports on Vercel.");
    }

    return { persisted: false, duplicate: false };
  }

  const db = getDb();
  const [brokerAccount] = await db
    .insert(brokerAccounts)
    .values({
      ownerUserId: input.ownerUserId,
      broker: input.parsed.broker,
      accountNumber: input.parsed.account.accountNumber,
      baseCurrency: input.parsed.account.baseCurrency ?? "EUR",
      displayName: input.parsed.account.displayName,
    })
    .onConflictDoUpdate({
      target: [brokerAccounts.ownerUserId, brokerAccounts.broker, brokerAccounts.accountNumber],
      set: {
        baseCurrency: input.parsed.account.baseCurrency ?? "EUR",
        displayName: input.parsed.account.displayName,
        updatedAt: new Date(),
      },
    })
    .returning({ id: brokerAccounts.id });

  if (!brokerAccount) {
    throw new Error("Failed to resolve broker account.");
  }

  const [createdImport] = await db
    .insert(imports)
    .values({
      ownerUserId: input.ownerUserId,
      brokerAccountId: brokerAccount.id,
      broker: input.parsed.broker,
      fileName: input.parsed.fileName,
      fileHash: input.fileHash,
      taxYear: input.parsed.taxYear,
      eventCount: input.parsed.events.length,
      insertedEventCount: 0,
      duplicateEventCount: 0,
      statementStartDate: input.parsed.statementStartDate,
      statementEndDate: input.parsed.statementEndDate,
    })
    .onConflictDoNothing({
      target: [imports.ownerUserId, imports.fileHash],
    })
    .returning({ id: imports.id });

  if (!createdImport) {
    return {
      persisted: true,
      duplicate: true,
      brokerAccountId: brokerAccount.id,
      insertedEventCount: 0,
      duplicateEventCount: input.parsed.events.length,
    };
  }

  let insertedEventCount = 0;
  if (input.parsed.events.length > 0) {
    const insertedTransactions = await db
      .insert(transactions)
      .values(
        input.parsed.events.map((event) =>
          toTransactionInsert({
            event,
            ownerUserId: input.ownerUserId,
            importId: createdImport.id,
            brokerAccountId: brokerAccount.id,
          }),
        ),
      )
      .onConflictDoNothing({
        target: [transactions.ownerUserId, transactions.brokerAccountId, transactions.eventFingerprint],
      })
      .returning({ id: transactions.id });

    insertedEventCount = insertedTransactions.length;
    await db
      .update(imports)
      .set({
        insertedEventCount,
        duplicateEventCount: input.parsed.events.length - insertedEventCount,
      })
      .where(eq(imports.id, createdImport.id));
  }

  return {
    persisted: true,
    duplicate: false,
    importId: createdImport.id,
    brokerAccountId: brokerAccount.id,
    insertedEventCount,
    duplicateEventCount: input.parsed.events.length - insertedEventCount,
  };
}

export function toTransactionInsert({
  event,
  ownerUserId,
  importId,
  brokerAccountId,
}: {
  event: NormalizedEvent;
  ownerUserId: string;
  importId: string;
  brokerAccountId: string;
}): TransactionInsert {
  return {
    ownerUserId,
    importId,
    brokerAccountId,
    broker: event.broker,
    accountNumber: event.accountNumber,
    eventFingerprint: computeEventFingerprint(event),
    eventType: event.type,
    eventDate: event.date,
    currency: event.currency,
    symbol: event.symbol,
    isin: event.isin,
    quantity: event.quantity,
    price: event.price,
    amount: event.amount,
    amountEur: event.amountEur,
    cashAmount: event.cashAmount,
    cashAmountEur: event.cashAmountEur,
    proceeds: event.proceeds,
    proceedsEur: event.proceedsEur,
    fee: event.fee,
    feeEur: event.feeEur,
    realizedPnl: event.realizedPnl,
    realizedPnlEur: event.realizedPnlEur,
    withholdingTax: event.withholdingTax,
    withholdingTaxEur: event.withholdingTaxEur,
    fxSource: event.fxSource,
    requiresReview: event.requiresReview ?? requiresTaxReview(event),
    reviewedAt: event.reviewedAt ? new Date(event.reviewedAt) : undefined,
    reviewedByUserId: event.reviewedByUserId,
    reviewNote: event.reviewNote,
    description: event.description,
    source: event.source ?? event.id,
    raw: event,
  };
}

export function applyManualReviewValues({
  ownerUserId,
  transactionId,
  reviewerUserId,
  values,
  reviewedAt = new Date(),
}: {
  ownerUserId: string;
  transactionId: string;
  reviewerUserId: string;
  values: ManualReviewValues;
  reviewedAt?: Date;
}): ManualReviewUpdate {
  return {
    ownerUserId,
    transactionId,
    set: {
      amountEur: values.amountEur,
      realizedPnlEur: values.realizedPnlEur,
      feeEur: values.feeEur,
      withholdingTaxEur: values.withholdingTaxEur,
      cashAmountEur: values.cashAmountEur,
      fxSource: "MANUAL_REVIEW",
      requiresReview: false,
      reviewedAt,
      reviewedByUserId: reviewerUserId,
      reviewNote: values.reviewNote,
    },
  };
}

export async function updateTransactionManualReview(input: {
  ownerUserId: string;
  transactionId: string;
  reviewerUserId: string;
  values: ManualReviewValues;
}): Promise<boolean> {
  if (!process.env.DATABASE_URL) {
    if (process.env.VERCEL === "1") {
      throw new Error("DATABASE_URL is required to update transaction reviews on Vercel.");
    }

    return false;
  }

  const update = applyManualReviewValues(input);
  const updated = await getDb()
    .update(transactions)
    .set(update.set)
    .where(and(eq(transactions.ownerUserId, update.ownerUserId), eq(transactions.id, update.transactionId)))
    .returning({ id: transactions.id });

  return updated.length > 0;
}

function requiresTaxReview(event: NormalizedEvent): boolean {
  if (event.currency === "EUR") {
    return false;
  }

  if (event.type === "DIVIDEND" || event.type === "INTEREST") {
    return event.amountEur === undefined;
  }

  if (event.type === "TRADE") {
    return event.realizedPnl !== undefined && event.realizedPnlEur === undefined;
  }

  if (event.type === "WITHHOLDING_TAX") {
    return event.withholdingTaxEur === undefined;
  }

  return false;
}
