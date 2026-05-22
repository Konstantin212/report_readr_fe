import { and, eq, sql } from "drizzle-orm";
import Decimal from "decimal.js";

import { getDb } from "@/lib/db/client";
import {
  brokerAccounts,
  cryptoAccounts,
  cryptoWallets,
  fxRates,
  lots as lotsTable,
  realizedMatches,
  transactions,
} from "@/lib/db/schema";
import {
  fetchAccounts,
  fetchSpotPriceEur,
  fetchTransactionsForAccount,
  type CoinbaseCredentials,
} from "@/lib/crypto/coinbase";
import { mapCoinbaseTransaction } from "@/lib/crypto/mapper";
import { convertEventToEur } from "@/lib/ledger/fx";
import { replayCrypto } from "@/lib/ledger/crypto-replay";
import type { NormalizedEvent } from "@/lib/domain/types";

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

  // Coinbase CDP key access returns native_balance = 0 on /v2/accounts,
  // so we compute EUR value ourselves: qty × public spot price (no auth).
  // Cache prices per symbol so we do one fetch per coin, not per wallet.
  const priceEur = new Map<string, string>();
  const uniqueSymbols = [...new Set(wallets.map((w) => w.currency?.code).filter(Boolean) as string[])];
  await Promise.all(
    uniqueSymbols.map(async (sym) => {
      if (sym === "EUR") {
        priceEur.set(sym, "1");
        return;
      }
      try {
        const price = await fetchSpotPriceEur(sym);
        if (price) priceEur.set(sym, price);
      } catch {
        // Coin not quoted in EUR (rare for major coins) — leave it out
        // and the wallet will land with native_amount = "0".
      }
    }),
  );

  for (const wallet of wallets) {
    const balanceQty = wallet.balance?.amount ?? "0";
    const sym = wallet.currency?.code ?? "?";
    const price = priceEur.get(sym);
    const nativeAmount = price ? multiply(balanceQty, price) : "0";
    await db
      .insert(cryptoWallets)
      .values({
        ownerUserId: opts.ownerUserId,
        cryptoAccountId: opts.cryptoAccountId,
        walletId: wallet.id,
        symbol: sym,
        name: wallet.name,
        quantity: balanceQty,
        nativeAmount,
        nativeCurrency: "EUR",
        primary: wallet.primary ?? false,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [cryptoWallets.cryptoAccountId, cryptoWallets.walletId],
        set: {
          symbol: sym,
          name: wallet.name,
          quantity: balanceQty,
          nativeAmount,
          nativeCurrency: "EUR",
          primary: wallet.primary ?? false,
          updatedAt: new Date(),
        },
      });
  }

  // Load ECB USD→EUR (and any other relevant pairs) once — the
  // converter divides amount by the stored rate to get EUR.
  const rateRows = await db.select().from(fxRates);
  const rateMap = new Map(rateRows.map((r) => [`${r.date}|${r.fromCurrency}`, r.rate]));

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

      const mapped = mapCoinbaseTransaction(tx, wallet, brokerAccountNumber);
      if (!mapped) {
        skipped++;
        continue;
      }

      const enriched = convertEventToEur(mapped, rateMap);
      // The Coinbase tx.id is globally unique per economic event — Coinbase
      // emits the same staking_reward in both the main and staked sub-
      // wallet's transaction lists, with identical ids. Using the id
      // directly as the fingerprint makes the unique constraint dedupe
      // them cleanly regardless of which wallet iteration we hit them
      // through. The semantic-hash fingerprint is fine for brokers that
      // give us statement files without per-event ids.
      const fingerprint = `coinbase:${tx.id}`;
      const result = await db
        .insert(transactions)
        .values({
          ownerUserId: opts.ownerUserId,
          brokerAccountId,
          broker: "COINBASE",
          accountNumber: brokerAccountNumber,
          eventFingerprint: fingerprint,
          eventType: enriched.type,
          eventDate: enriched.date,
          currency: enriched.currency,
          symbol: enriched.symbol,
          quantity: enriched.quantity,
          amount: enriched.amount,
          amountEur: enriched.amountEur,
          fxSource: enriched.fxSource ?? null,
          requiresReview: enriched.requiresReview ?? false,
          name: enriched.name,
          description: enriched.description,
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

  // After all new transactions land, rebuild lots + realized matches
  // for this brokerAccount. Idempotent: we drop the previous state
  // and recompute from scratch. The volume is small (hundreds of events
  // even for an active staker), so the simplicity beats incremental.
  await rebuildCryptoLots(opts.ownerUserId, brokerAccountId);

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

export async function rebuildCryptoLots(ownerUserId: string, brokerAccountId: string): Promise<void> {
  const db = getDb();

  const rows = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.ownerUserId, ownerUserId), eq(transactions.brokerAccountId, brokerAccountId)));

  const events: NormalizedEvent[] = rows
    .filter((r) => r.eventType === "CRYPTO_BUY" || r.eventType === "CRYPTO_SELL" || r.eventType === "CRYPTO_STAKE_REWARD")
    .map((r) => ({
      id: r.eventFingerprint,
      broker: "COINBASE",
      accountNumber: r.accountNumber,
      type: r.eventType as NormalizedEvent["type"],
      date: r.eventDate,
      currency: r.currency,
      symbol: r.symbol ?? undefined,
      quantity: r.quantity ?? undefined,
      amount: r.amount ?? undefined,
      amountEur: r.amountEur ?? undefined,
    }));

  const { lots, matches } = replayCrypto(events);

  // Wipe prior state for this brokerAccount only — leaves stock data
  // untouched if any.
  await db.delete(lotsTable).where(and(eq(lotsTable.ownerUserId, ownerUserId), eq(lotsTable.brokerAccountId, brokerAccountId)));
  await db
    .delete(realizedMatches)
    .where(and(eq(realizedMatches.ownerUserId, ownerUserId), eq(realizedMatches.brokerAccountId, brokerAccountId)));

  if (lots.length > 0) {
    await db.insert(lotsTable).values(
      lots.map((l) => ({
        ownerUserId,
        brokerAccountId,
        symbol: l.symbol,
        openedAt: l.openedAt,
        remainingQty: l.remainingQty,
        costEur: l.costEur,
        sourceEventFingerprint: l.sourceEventId,
      })),
    );
  }
  if (matches.length > 0) {
    await db.insert(realizedMatches).values(
      matches.map((m) => ({
        ownerUserId,
        brokerAccountId,
        symbol: m.symbol,
        openingFingerprint: m.openingEventId,
        closingFingerprint: m.closingEventId,
        qty: m.qty,
        costEur: m.costEur,
        proceedsEur: m.proceedsEur,
        gainEur: m.gainEur,
        holdingDays: m.holdingDays,
        isLongTerm: m.isLongTerm,
        closedAt: m.closedAt,
      })),
    );
  }
}

/**
 * Wrap a sync attempt to capture failures into the lastSyncError column.
 * The caller still sees the original error.
 */
function multiply(a: string, b: string): string {
  return new Decimal(a).times(b).toFixed(8);
}

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
