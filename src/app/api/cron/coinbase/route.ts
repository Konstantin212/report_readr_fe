import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { cryptoAccounts } from "@/lib/db/schema";
import { decryptString } from "@/lib/crypto/aes";
import { CoinbaseAuthError } from "@/lib/crypto/coinbase";
import { recordSyncFailure, syncCoinbaseAccount } from "@/lib/crypto/sync";

/**
 * Daily Coinbase sync. Iterates every `crypto_accounts` row with
 * status='active', decrypts credentials, calls syncCoinbaseAccount, and
 * records per-account success/failure. Failures don't abort the loop —
 * one bad key shouldn't prevent another user's sync.
 *
 * Auth: same Bearer CRON_SECRET as /api/cron/fx; Vercel sends this
 * header automatically when invoking via vercel.ts crons config.
 */

export const maxDuration = 60;

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const db = getDb();
  const accounts = await db
    .select()
    .from(cryptoAccounts)
    .where(eq(cryptoAccounts.status, "active"));

  let totalInserted = 0;
  let succeeded = 0;
  let failed = 0;
  const results: { accountId: string; ok: boolean; inserted?: number; error?: string }[] = [];

  for (const acct of accounts) {
    try {
      const credentials = {
        apiKey: decryptString({ ciphertext: acct.apiKeyCiphertext, iv: acct.apiKeyIv }),
        apiSecret: decryptString({ ciphertext: acct.apiSecretCiphertext, iv: acct.apiSecretIv }),
      };
      const result = await syncCoinbaseAccount({
        ownerUserId: acct.ownerUserId,
        cryptoAccountId: acct.id,
        credentials,
        label: acct.label,
        previousCursor: acct.lastSyncCursor,
      });
      totalInserted += result.inserted;
      succeeded += 1;
      results.push({ accountId: acct.id, ok: true, inserted: result.inserted });
    } catch (e) {
      await recordSyncFailure(acct.ownerUserId, acct.id, e);
      failed += 1;
      const msg = e instanceof CoinbaseAuthError ? "auth" : e instanceof Error ? e.message : "unknown";
      results.push({ accountId: acct.id, ok: false, error: msg });
    }
  }

  return NextResponse.json({
    scanned: accounts.length,
    succeeded,
    failed,
    totalInserted,
    results,
  });
}
