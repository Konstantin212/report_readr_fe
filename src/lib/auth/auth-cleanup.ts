import { and, eq, isNotNull, lt, notExists, or, sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";

import * as schema from "@/lib/db/schema";
import {
  user,
  verification,
  signupAttempts,
  brokerAccounts,
  imports,
  instruments,
  transactions,
  positions,
  taxReports,
  taxReportLines,
  lots,
  realizedMatches,
  userSettings,
  cryptoAccounts,
  cryptoWallets,
  cryptoDailyValues,
} from "@/lib/db/schema";

/**
 * Extracted from src/app/api/cron/auth-cleanup/route.ts: a Next.js App
 * Router route file may only export the route's HTTP method handlers
 * (GET/POST/...) plus a small allow-listed set of config fields
 * (runtime, dynamic, maxDuration, revalidate, ...) — Next's own
 * type-checking pass in `next build` (distinct from `tsc --noEmit`,
 * which doesn't catch this) rejects any other named export with
 * "... is not a valid Route export field". Since this predicate and
 * `runAuthCleanup` need to be unit-testable independent of constructing
 * a `Request`/`NextResponse` (see tests/api/cron/auth-cleanup*.test.ts),
 * they live here instead and the route just imports + calls them.
 */
export type Db = NeonHttpDatabase<typeof schema>;

/**
 * "Abandoned signup" candidate (design doc §23): never-verified,
 * 6+ months old, AND zero rows in every owner-scoped table. This is a
 * LIVING LIST, not a one-time enumeration — see the doc-comment above
 * `user` in src/lib/db/schema.ts. If a future table adds an
 * `ownerUserId`-shaped FK to `user.id`, it MUST be added to the
 * `notExists(...)` clauses below, or this safeguard silently stops
 * covering it and could delete a user who actually has real data there.
 *
 * Deliberately NOT included (each for a documented reason — see design
 * doc §23.2): `session`/`account` (auth-mechanism rows the deletion is
 * *supposed* to remove — they cascade automatically, `onDelete: "cascade"`
 * on both), `allowedEmails.addedByUserId` (admin-authorship pointer, not
 * the candidate's own data, `onDelete: "set null"`),
 * `transactions.reviewedByUserId` (same reasoning, `onDelete: "set null"`),
 * and `instrumentMeta`/`fxRates`/`quoteCache`/`quoteHistory` (global,
 * user-independent market data with no owner column at all).
 */
export function abandonedCandidatePredicate(db: Db) {
  return and(
    eq(user.emailVerified, false),
    lt(user.createdAt, sql`now() - interval '6 months'`),
    notExists(db.select({ x: brokerAccounts.id }).from(brokerAccounts).where(eq(brokerAccounts.ownerUserId, user.id))),
    notExists(db.select({ x: imports.id }).from(imports).where(eq(imports.ownerUserId, user.id))),
    notExists(db.select({ x: instruments.id }).from(instruments).where(eq(instruments.ownerUserId, user.id))),
    notExists(db.select({ x: transactions.id }).from(transactions).where(eq(transactions.ownerUserId, user.id))),
    notExists(db.select({ x: positions.ownerUserId }).from(positions).where(eq(positions.ownerUserId, user.id))),
    notExists(db.select({ x: taxReports.id }).from(taxReports).where(eq(taxReports.ownerUserId, user.id))),
    notExists(db.select({ x: taxReportLines.id }).from(taxReportLines).where(eq(taxReportLines.ownerUserId, user.id))),
    notExists(db.select({ x: lots.id }).from(lots).where(eq(lots.ownerUserId, user.id))),
    notExists(db.select({ x: realizedMatches.id }).from(realizedMatches).where(eq(realizedMatches.ownerUserId, user.id))),
    notExists(db.select({ x: userSettings.ownerUserId }).from(userSettings).where(eq(userSettings.ownerUserId, user.id))),
    notExists(db.select({ x: cryptoAccounts.id }).from(cryptoAccounts).where(eq(cryptoAccounts.ownerUserId, user.id))),
    notExists(db.select({ x: cryptoWallets.cryptoAccountId }).from(cryptoWallets).where(eq(cryptoWallets.ownerUserId, user.id))),
    notExists(db.select({ x: cryptoDailyValues.ownerUserId }).from(cryptoDailyValues).where(eq(cryptoDailyValues.ownerUserId, user.id))),
  );
}

export type AuthCleanupResult = {
  verificationRowsDeleted: number;
  signupAttemptsRowsDeleted: number;
  abandonedAccounts:
    | { dryRun: true; count: number; candidates: { id: string; email: string; createdAt: Date }[] }
    | { dryRun: false; count: number; deleted: { id: string; email: string; createdAt: Date }[] };
};

/**
 * Runs both sweeps. Extracted so it's testable against a real
 * (disposable-row) Postgres connection without needing to construct a
 * `Request`/`NextResponse` — see tests/api/cron/auth-cleanup.test.ts.
 *
 * Deviation from design doc §23.3, flagged explicitly: the doc's
 * pseudocode wraps the abandoned-account select+delete in
 * `db.transaction(...)` to close the TOCTOU gap (re-checking the
 * safeguard predicate at delete time, not trusting a list computed
 * earlier). The installed neon-http driver has **no transaction
 * support** — `drizzle-orm/neon-http/session.js` throws "No transactions
 * support in neon-http driver" on `db.transaction()`. Instead, the real
 * deletion mode below issues a single atomic
 * `DELETE ... WHERE <predicate> RETURNING ...` statement: the predicate
 * is evaluated by Postgres at the moment of deletion in one round trip,
 * which closes the same TOCTOU gap (arguably more tightly, since there's
 * no JS-level select-then-delete window at all) without needing
 * `db.transaction()`.
 */
export async function runAuthCleanup(
  db: Db,
  opts: { deleteEnabled: boolean },
): Promise<AuthCleanupResult> {
  const deletedVerifications = await db
    .delete(verification)
    .where(lt(verification.expiresAt, sql`now()`))
    .returning({ id: verification.id });

  // Third sweep (email-verification-gate design doc §2.4): signupAttempts
  // rows carry no user-identifying value once expired or consumed — same
  // reasoning as the expired-verification-token sweep above — so this
  // runs unconditionally, not gated behind
  // AUTH_CLEANUP_DELETE_ENABLED (which only gates the *abandoned-account*
  // deletion below). `onDelete: "cascade"` on signupAttempts.userId also
  // means an abandoned-account deletion cascades this table
  // automatically, so this sweep exists to catch the much more common
  // case: rows left behind by ordinary, successful sign-ups/verifications.
  const deletedSignupAttempts = await db
    .delete(signupAttempts)
    .where(or(lt(signupAttempts.expiresAt, sql`now()`), isNotNull(signupAttempts.consumedAt)))
    .returning({ id: signupAttempts.id });

  if (!opts.deleteEnabled) {
    const candidates = await db
      .select({ id: user.id, email: user.email, createdAt: user.createdAt })
      .from(user)
      .where(abandonedCandidatePredicate(db));

    console.log(
      JSON.stringify({
        event: "auth-cleanup.abandoned-accounts.dry-run",
        count: candidates.length,
        candidates,
      }),
    );

    return {
      verificationRowsDeleted: deletedVerifications.length,
      signupAttemptsRowsDeleted: deletedSignupAttempts.length,
      abandonedAccounts: { dryRun: true, count: candidates.length, candidates },
    };
  }

  const deleted = await db
    .delete(user)
    .where(abandonedCandidatePredicate(db))
    .returning({ id: user.id, email: user.email, createdAt: user.createdAt });
  // `account`/`session` rows cascade-delete automatically
  // (onDelete: "cascade", schema.ts) — no separate DELETE needed.

  console.log(
    JSON.stringify({
      event: "auth-cleanup.abandoned-accounts.deleted",
      count: deleted.length,
      deleted,
    }),
  );

  return {
    verificationRowsDeleted: deletedVerifications.length,
    signupAttemptsRowsDeleted: deletedSignupAttempts.length,
    abandonedAccounts: { dryRun: false, count: deleted.length, deleted },
  };
}
