import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { brokerAccounts, cryptoAccounts, cryptoWallets, transactions } from "@/lib/db/schema";
import {
  fetchAccounts,
  fetchTransactionsForAccount,
  type CoinbaseCredentials,
} from "@/lib/crypto/coinbase";
import { mapCoinbaseTransaction } from "@/lib/crypto/mapper";
import { computeEventFingerprint } from "@/lib/imports/fingerprint";

export type SyncResult = {
  inserted: number;
  skipped: number;
  walletsScanned: number;
  newestTransactionId: string | null;
};

/**
 * One-shot sync for a single connected Coinbase account. Idempotent — re-
 * runs only insert events not seen before, identified by event_fingerprint
 * which we derive from the Coinbase transaction id.
 *
 * Step 1: ensure a broker_accounts stub exists for this crypto_account
 * Step 2: pull every wallet (each coin = its own wallet on Coinbase)
 * Step 3: for each wallet, pull transactions since last cursor
 * Step 4: map to NormalizedEvent, insert ON CONFLICT DO NOTHING
 * Step 5: update lastSyncAt + lastSyncCursor on the crypto_account
 */
export async function syncCoinbaseAccount(opts: {
  ownerUserId: string;
  cryptoAccountId: string;
  credentials: CoinbaseCredentials;
  label: string | null;
  previousCursor: string | null;
}): Promise<SyncResult> {
  const db = getDb();
  const brokerAccountNumber = opts.cryptoAccountId;

  const [stub] = await db
    .insert(brokerAccounts)
    .values({
      ownerUserId: opts.ownerUserId,
      broker: "COINBASE",
      accountNumber: brokerAccountNumber,
      baseCurrency: "EUR",
      displayName: opts.label ?? "Coinbase",
    })
    .onConflictDoNothing({
      target: [brokerAccounts.ownerUserId, brokerAccounts.broker, brokerAccounts.accountNumber],
    })
    .returning();

  const brokerAccountId =
    stub?.id ??
    (
      await db
        .select({ id: brokerAccounts.id })
        .from(brokerAccounts)
        .where(
          and(
            eq(brokerAccounts.ownerUserId, opts.ownerUserId),
            eq(brokerAccounts.broker, "COINBASE"),
            eq(brokerAccounts.accountNumber, brokerAccountNumber),
          ),
        )
        .limit(1)
    )[0]?.id;

  if (!brokerAccountId) throw new Error("Failed to ensure broker_account stub for Coinbase");

  const wallets = await fetchAccounts(opts.credentials);

  // Snapshot balances per wallet for the Dashboard. native_balance may be
  // missing on rare account types — skip those rather than fail the sync.
  for (const wallet of wallets) {
    const balanceQty = wallet.balance?.amount ?? "0";
    const nativeAmount = wallet.native_balance?.amount ?? "0";
    const nativeCurrency = wallet.native_balance?.currency ?? "EUR";
    await db
      .insert(cryptoWallets)
      .values({
        ownerUserId: opts.ownerUserId,
        cryptoAccountId: opts.cryptoAccountId,
        walletId: wallet.id,
        symbol: wallet.currency?.code ?? "?",
        name: wallet.name,
        quantity: balanceQty,
        nativeAmount,
        nativeCurrency,
        primary: wallet.primary ?? false,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [cryptoWallets.cryptoAccountId, cryptoWallets.walletId],
        set: {
          symbol: wallet.currency?.code ?? "?",
          name: wallet.name,
          quantity: balanceQty,
          nativeAmount,
          nativeCurrency,
          primary: wallet.primary ?? false,
          updatedAt: new Date(),
        },
      });
  }

  let inserted = 0;
  let skipped = 0;
  let newestTransactionId: string | null = null;
  let newestCreatedAt = "";

  for (const wallet of wallets) {
    const txs = await fetchTransactionsForAccount(
      opts.credentials,
      wallet.id,
      opts.previousCursor ?? undefined,
    );

    for (const tx of txs) {
      if (newestCreatedAt < tx.created_at) {
        newestCreatedAt = tx.created_at;
        newestTransactionId = tx.id;
      }

      const normalized = mapCoinbaseTransaction(tx, wallet, brokerAccountNumber);
      if (!normalized) {
        skipped++;
        continue;
      }

      const fingerprint = computeEventFingerprint(normalized);
      const result = await db
        .insert(transactions)
        .values({
          ownerUserId: opts.ownerUserId,
          brokerAccountId,
          broker: "COINBASE",
          accountNumber: brokerAccountNumber,
          eventFingerprint: fingerprint,
          eventType: normalized.type,
          eventDate: normalized.date,
          currency: normalized.currency,
          symbol: normalized.symbol,
          quantity: normalized.quantity,
          amount: normalized.amount,
          amountEur: normalized.amountEur,
          fxSource: normalized.fxSource ?? null,
          requiresReview: normalized.requiresReview ?? false,
          name: normalized.name,
          description: normalized.description,
          source: "COINBASE",
          raw: tx as unknown as Record<string, unknown>,
        })
        .onConflictDoNothing({
          target: [transactions.ownerUserId, transactions.brokerAccountId, transactions.eventFingerprint],
        })
        .returning({ id: transactions.id });

      if (result.length === 1) inserted++;
      else skipped++;
    }
  }

  await db
    .update(cryptoAccounts)
    .set({
      lastSyncAt: new Date(),
      lastSyncEventCount: sql`${cryptoAccounts.lastSyncEventCount} + ${inserted}`,
      lastSyncCursor: newestTransactionId ?? opts.previousCursor,
      lastSyncError: null,
      status: "active",
    })
    .where(
      and(eq(cryptoAccounts.id, opts.cryptoAccountId), eq(cryptoAccounts.ownerUserId, opts.ownerUserId)),
    );

  return { inserted, skipped, walletsScanned: wallets.length, newestTransactionId };
}

/**
 * Wrap a sync attempt to capture failures into the lastSyncError column.
 * The caller still sees the original error.
 */
export async function recordSyncFailure(
  ownerUserId: string,
  cryptoAccountId: string,
  err: unknown,
): Promise<void> {
  const msg = err instanceof Error ? err.message : String(err);
  await getDb()
    .update(cryptoAccounts)
    .set({ lastSyncError: msg.slice(0, 500), status: "invalid" })
    .where(and(eq(cryptoAccounts.id, cryptoAccountId), eq(cryptoAccounts.ownerUserId, ownerUserId)));
}
