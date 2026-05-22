import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { cryptoAccounts } from "@/lib/db/schema";
import { encryptString, decryptString } from "@/lib/crypto/aes";
import type { CoinbaseCredentials } from "@/lib/crypto/coinbase";

export type CryptoAccountRow = typeof cryptoAccounts.$inferSelect;

/**
 * Public-safe shape — never includes the encrypted credential pair. This
 * is what we hand to client components and Server Component renderers.
 */
export type CryptoAccountPublic = {
  id: string;
  exchange: string;
  label: string | null;
  scopes: string;
  exchangeUserId: string | null;
  status: string;
  lastSyncAt: Date | null;
  lastSyncError: string | null;
  lastSyncEventCount: number;
  connectedAt: Date;
};

function toPublic(row: CryptoAccountRow): CryptoAccountPublic {
  return {
    id: row.id,
    exchange: row.exchange,
    label: row.label,
    scopes: row.scopes,
    exchangeUserId: row.exchangeUserId,
    status: row.status,
    lastSyncAt: row.lastSyncAt,
    lastSyncError: row.lastSyncError,
    lastSyncEventCount: row.lastSyncEventCount,
    connectedAt: row.connectedAt,
  };
}

export async function listCryptoAccountsForUser(ownerUserId: string): Promise<CryptoAccountPublic[]> {
  const rows = await getDb()
    .select()
    .from(cryptoAccounts)
    .where(eq(cryptoAccounts.ownerUserId, ownerUserId))
    .orderBy(desc(cryptoAccounts.connectedAt));
  return rows.map(toPublic);
}

export type InsertCryptoAccountInput = {
  ownerUserId: string;
  exchange: string;
  label: string | null;
  credentials: CoinbaseCredentials;
  scopes: string;
  exchangeUserId: string;
};

/**
 * Encrypt-and-insert. The plaintext credentials enter this function and
 * never escape it — the returned row holds only ciphertext + IV.
 */
export async function insertCryptoAccount(input: InsertCryptoAccountInput): Promise<CryptoAccountPublic> {
  const keyEnc = encryptString(input.credentials.apiKey);
  const secretEnc = encryptString(input.credentials.apiSecret);

  const [row] = await getDb()
    .insert(cryptoAccounts)
    .values({
      ownerUserId: input.ownerUserId,
      exchange: input.exchange,
      label: input.label,
      apiKeyCiphertext: keyEnc.ciphertext,
      apiKeyIv: keyEnc.iv,
      apiSecretCiphertext: secretEnc.ciphertext,
      apiSecretIv: secretEnc.iv,
      scopes: input.scopes,
      exchangeUserId: input.exchangeUserId,
      status: "active",
    })
    .returning();

  return toPublic(row);
}

/**
 * Decrypt the credential pair for a given account. Caller is expected to
 * use the result immediately and not hold it in memory longer than the
 * lifetime of a single signed request.
 */
export async function getDecryptedCredentials(
  ownerUserId: string,
  accountId: string,
): Promise<CoinbaseCredentials | null> {
  const [row] = await getDb()
    .select()
    .from(cryptoAccounts)
    .where(and(eq(cryptoAccounts.id, accountId), eq(cryptoAccounts.ownerUserId, ownerUserId)))
    .limit(1);
  if (!row) return null;
  return {
    apiKey: decryptString({ ciphertext: row.apiKeyCiphertext, iv: row.apiKeyIv }),
    apiSecret: decryptString({ ciphertext: row.apiSecretCiphertext, iv: row.apiSecretIv }),
  };
}

export async function deleteCryptoAccount(ownerUserId: string, accountId: string): Promise<number> {
  const deleted = await getDb()
    .delete(cryptoAccounts)
    .where(and(eq(cryptoAccounts.id, accountId), eq(cryptoAccounts.ownerUserId, ownerUserId)))
    .returning({ id: cryptoAccounts.id });
  return deleted.length;
}
