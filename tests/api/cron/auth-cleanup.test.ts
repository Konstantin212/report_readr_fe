import { randomUUID } from "node:crypto";

import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { runAuthCleanup } from "@/lib/auth/auth-cleanup";
import { getDb } from "@/lib/db/client";
import { signupAttempts, user, userSettings, verification } from "@/lib/db/schema";

/**
 * Real-DB integration test, following this repo's existing convention
 * (tests/deploy/neon-smoke.test.ts): gated on `it.skipIf(!process.env.DATABASE_URL)`
 * so it runs against the configured Postgres locally/in CI when
 * DATABASE_URL is set, and is a no-op otherwise. This is the strongest
 * available verification of the "never delete a user with owned data"
 * guarantee (design doc §23.2) — a `.toSQL()` structural check (see
 * auth-cleanup-predicate.test.ts) proves the query *shape* is right, but
 * only a real query against real rows proves the *behavior* is right.
 *
 * Every test uses a run-scoped id prefix and cleans up its own rows in a
 * `finally` block (not relying on test execution order), plus a blanket
 * `afterAll` safety net in case an assertion fails mid-test.
 */
const RUN_ID = `auth-cleanup-test:${Date.now()}:${Math.random().toString(36).slice(2)}`;
const allUserIds: string[] = [];
const allVerificationIds: string[] = [];
const allSignupAttemptIds: string[] = [];

function uid(suffix: string): string {
  const id = `${RUN_ID}:${suffix}`;
  allUserIds.push(id);
  return id;
}

function vid(): string {
  const id = randomUUID();
  allVerificationIds.push(id);
  return id;
}

function said(): string {
  const id = randomUUID();
  allSignupAttemptIds.push(id);
  return id;
}

async function cleanupAll() {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  await db.delete(userSettings).where(inArray(userSettings.ownerUserId, allUserIds));
  await db.delete(signupAttempts).where(inArray(signupAttempts.attemptId, allSignupAttemptIds));
  await db.delete(user).where(inArray(user.id, allUserIds));
  await db.delete(verification).where(inArray(verification.id, allVerificationIds));
}

afterAll(cleanupAll);

const MONTHS_AGO = (n: number) => new Date(Date.now() - n * 30 * 24 * 60 * 60 * 1000);

/**
 * Calendar-accurate "N months ago, plus/minus a day" — unlike `MONTHS_AGO`
 * above (a 30-day approximation, fine for the "clearly old"/"clearly
 * recent" cases elsewhere in this file), the predicate's own
 * `now() - interval '6 months'` is evaluated by Postgres using *calendar*
 * month arithmetic (28–31 days depending on the month), not a flat
 * 30-day multiple. Boundary-precision here matters, so this mirrors that
 * with `Date.setUTCMonth`, which is also calendar-based.
 */
function monthsAgoCalendar(months: number, dayOffset = 0): Date {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return d;
}

describe("runAuthCleanup (real DB integration)", () => {
  it.skipIf(!process.env.DATABASE_URL)(
    "6-month boundary: a never-verified account 1 day past the threshold is a candidate, 1 day short of it is not (AC-28)",
    async () => {
      const db = getDb();
      const justOverId = uid("boundary-just-over"); // 6 months + 1 day old
      const justUnderId = uid("boundary-just-under"); // 6 months - 1 day old

      try {
        await db.insert(user).values([
          {
            id: justOverId,
            email: `${justOverId}@example.com`,
            emailVerified: false,
            createdAt: monthsAgoCalendar(6, -1),
            updatedAt: monthsAgoCalendar(6, -1),
          },
          {
            id: justUnderId,
            email: `${justUnderId}@example.com`,
            emailVerified: false,
            createdAt: monthsAgoCalendar(6, 1),
            updatedAt: monthsAgoCalendar(6, 1),
          },
        ]);

        const result = await runAuthCleanup(db, { deleteEnabled: false });
        expect(result.abandonedAccounts.dryRun).toBe(true);
        if (!result.abandonedAccounts.dryRun) throw new Error("expected dry-run result shape");
        const candidateIds = result.abandonedAccounts.candidates.map((c) => c.id);

        expect(candidateIds).toContain(justOverId);
        expect(candidateIds).not.toContain(justUnderId);
      } finally {
        await db.delete(user).where(inArray(user.id, [justOverId, justUnderId]));
      }
    },
  );


  it.skipIf(!process.env.DATABASE_URL)(
    "dry run: lists only the truly-abandoned candidate, deletes nothing",
    async () => {
      const db = getDb();
      const abandonedId = uid("dry-abandoned");
      const hasDataId = uid("dry-has-data");
      const tooRecentId = uid("dry-too-recent");
      const verifiedOldId = uid("dry-verified-old");

      try {
        await db.insert(user).values([
          { id: abandonedId, email: `${abandonedId}@example.com`, emailVerified: false, createdAt: MONTHS_AGO(7), updatedAt: MONTHS_AGO(7) },
          { id: hasDataId, email: `${hasDataId}@example.com`, emailVerified: false, createdAt: MONTHS_AGO(7), updatedAt: MONTHS_AGO(7) },
          { id: tooRecentId, email: `${tooRecentId}@example.com`, emailVerified: false, createdAt: MONTHS_AGO(1), updatedAt: MONTHS_AGO(1) },
          { id: verifiedOldId, email: `${verifiedOldId}@example.com`, emailVerified: true, createdAt: MONTHS_AGO(7), updatedAt: MONTHS_AGO(7) },
        ]);
        // hasDataId owns a userSettings row — must never be deleted despite
        // otherwise matching the abandoned predicate (never-verified, old).
        await db.insert(userSettings).values({ ownerUserId: hasDataId });

        const result = await runAuthCleanup(db, { deleteEnabled: false });

        expect(result.abandonedAccounts.dryRun).toBe(true);
        if (!result.abandonedAccounts.dryRun) throw new Error("expected dry-run result shape");
        const candidateIds = result.abandonedAccounts.candidates.map((c) => c.id);
        expect(candidateIds).toContain(abandonedId);
        expect(candidateIds).not.toContain(hasDataId);
        expect(candidateIds).not.toContain(tooRecentId);
        expect(candidateIds).not.toContain(verifiedOldId);

        // Dry run must not have deleted anyone — all four rows still exist.
        const stillThere = await db
          .select({ id: user.id })
          .from(user)
          .where(inArray(user.id, [abandonedId, hasDataId, tooRecentId, verifiedOldId]));
        expect(stillThere).toHaveLength(4);
      } finally {
        await db.delete(userSettings).where(inArray(userSettings.ownerUserId, [hasDataId]));
        await db.delete(user).where(inArray(user.id, [abandonedId, hasDataId, tooRecentId, verifiedOldId]));
      }
    },
  );

  it.skipIf(!process.env.DATABASE_URL)(
    "real run: deletes the truly-abandoned candidate but never a user with owned data",
    async () => {
      const db = getDb();
      const abandonedId = uid("real-abandoned");
      const hasDataId = uid("real-has-data");
      const tooRecentId = uid("real-too-recent");
      const verifiedOldId = uid("real-verified-old");

      try {
        await db.insert(user).values([
          { id: abandonedId, email: `${abandonedId}@example.com`, emailVerified: false, createdAt: MONTHS_AGO(7), updatedAt: MONTHS_AGO(7) },
          { id: hasDataId, email: `${hasDataId}@example.com`, emailVerified: false, createdAt: MONTHS_AGO(7), updatedAt: MONTHS_AGO(7) },
          { id: tooRecentId, email: `${tooRecentId}@example.com`, emailVerified: false, createdAt: MONTHS_AGO(1), updatedAt: MONTHS_AGO(1) },
          { id: verifiedOldId, email: `${verifiedOldId}@example.com`, emailVerified: true, createdAt: MONTHS_AGO(7), updatedAt: MONTHS_AGO(7) },
        ]);
        await db.insert(userSettings).values({ ownerUserId: hasDataId });

        const result = await runAuthCleanup(db, { deleteEnabled: true });

        expect(result.abandonedAccounts.dryRun).toBe(false);
        if (result.abandonedAccounts.dryRun) throw new Error("expected real-run result shape");
        const deletedIds = result.abandonedAccounts.deleted.map((d) => d.id);
        expect(deletedIds).toContain(abandonedId);
        expect(deletedIds).not.toContain(hasDataId);
        expect(deletedIds).not.toContain(tooRecentId);
        expect(deletedIds).not.toContain(verifiedOldId);

        const remaining = await db
          .select({ id: user.id })
          .from(user)
          .where(inArray(user.id, [abandonedId, hasDataId, tooRecentId, verifiedOldId]));
        const remainingIds = remaining.map((r) => r.id);
        expect(remainingIds).not.toContain(abandonedId);
        expect(remainingIds).toContain(hasDataId);
        expect(remainingIds).toContain(tooRecentId);
        expect(remainingIds).toContain(verifiedOldId);
      } finally {
        await db.delete(userSettings).where(inArray(userSettings.ownerUserId, [hasDataId]));
        await db.delete(user).where(inArray(user.id, [hasDataId, tooRecentId, verifiedOldId]));
      }
    },
  );

  it.skipIf(!process.env.DATABASE_URL)(
    "concurrent-modification safety: a candidate that acquires owned data between an earlier dry-run and the real delete is not deleted (design doc §23.3 TOCTOU note)",
    async () => {
      const db = getDb();
      const candidateId = uid("toctou-candidate");

      try {
        await db.insert(user).values({
          id: candidateId,
          email: `${candidateId}@example.com`,
          emailVerified: false,
          createdAt: MONTHS_AGO(7),
          updatedAt: MONTHS_AGO(7),
        });

        // 1. A dry run (e.g. an earlier day's cron invocation) sees this
        //    user as a genuine candidate — it has no owned data yet.
        const dryRun = await runAuthCleanup(db, { deleteEnabled: false });
        expect(dryRun.abandonedAccounts.dryRun).toBe(true);
        if (!dryRun.abandonedAccounts.dryRun) throw new Error("expected dry-run result shape");
        expect(dryRun.abandonedAccounts.candidates.map((c) => c.id)).toContain(candidateId);

        // 2. Between that dry run and the real delete, the user "concurrently"
        //    starts using the app for real (e.g. imports a statement) —
        //    modelled here as a userSettings row appearing after the fact,
        //    not by racing two real async operations (which Postgres/JS
        //    can't deterministically interleave in a test). The real
        //    deletion mode below issues a single atomic
        //    `DELETE ... WHERE <predicate> RETURNING ...` (see auth-cleanup.ts's
        //    own doc-comment on why: neon-http has no transaction support,
        //    so this one-round-trip statement is what closes the TOCTOU gap
        //    instead) — so the predicate must be re-evaluated fresh right
        //    here, not trusted from the dry run computed a step earlier.
        await db.insert(userSettings).values({ ownerUserId: candidateId });

        // 3. The real delete run must NOT delete this user, even though an
        //    earlier snapshot (step 1) said it was a candidate.
        const realRun = await runAuthCleanup(db, { deleteEnabled: true });
        expect(realRun.abandonedAccounts.dryRun).toBe(false);
        if (realRun.abandonedAccounts.dryRun) throw new Error("expected real-run result shape");
        expect(realRun.abandonedAccounts.deleted.map((d) => d.id)).not.toContain(candidateId);

        const stillThere = await db.select({ id: user.id }).from(user).where(inArray(user.id, [candidateId]));
        expect(stillThere).toHaveLength(1);
      } finally {
        await db.delete(userSettings).where(inArray(userSettings.ownerUserId, [candidateId]));
        await db.delete(user).where(inArray(user.id, [candidateId]));
      }
    },
  );

  it.skipIf(!process.env.DATABASE_URL)(
    "deletes expired verification rows but keeps unexpired ones",
    async () => {
      const db = getDb();
      const expiredId = vid();
      const freshId = vid();

      try {
        await db.insert(verification).values([
          { id: expiredId, identifier: `reset-password:${expiredId}`, value: "some-user-id", expiresAt: MONTHS_AGO(1) },
          { id: freshId, identifier: `reset-password:${freshId}`, value: "some-user-id", expiresAt: new Date(Date.now() + 3600 * 1000) },
        ]);

        const result = await runAuthCleanup(db, { deleteEnabled: false });
        expect(result.verificationRowsDeleted).toBeGreaterThanOrEqual(1);

        const remaining = await db
          .select({ id: verification.id })
          .from(verification)
          .where(inArray(verification.id, [expiredId, freshId]));
        const remainingIds = remaining.map((r) => r.id);
        expect(remainingIds).not.toContain(expiredId);
        expect(remainingIds).toContain(freshId);
      } finally {
        await db.delete(verification).where(inArray(verification.id, [expiredId, freshId]));
      }
    },
  );

  // Third sweep (email-verification-gate design doc §2.4, build step 5):
  // unconditional, like the verification sweep above — deletes
  // signupAttempts rows that are either past their TTL or already
  // consumed (a completed cross-device grant), keeps rows still pending
  // and within TTL.
  it.skipIf(!process.env.DATABASE_URL)(
    "deletes expired or consumed signupAttempts rows, keeps ones still pending and within TTL",
    async () => {
      const db = getDb();
      const ownerId = uid("signup-attempt-owner");
      const expiredAttemptId = said();
      const consumedAttemptId = said();
      const pendingAttemptId = said();

      try {
        await db.insert(user).values({
          id: ownerId,
          email: `${ownerId}@example.com`,
          emailVerified: true,
        });
        await db.insert(signupAttempts).values([
          {
            attemptId: expiredAttemptId,
            userId: ownerId,
            expiresAt: MONTHS_AGO(1),
            consumedAt: null,
          },
          {
            attemptId: consumedAttemptId,
            userId: ownerId,
            expiresAt: new Date(Date.now() + 3600 * 1000), // still within TTL...
            consumedAt: new Date(), // ...but already consumed, so still swept
          },
          {
            attemptId: pendingAttemptId,
            userId: ownerId,
            expiresAt: new Date(Date.now() + 3600 * 1000),
            consumedAt: null,
          },
        ]);

        const result = await runAuthCleanup(db, { deleteEnabled: false });
        expect(result.signupAttemptsRowsDeleted).toBeGreaterThanOrEqual(2);

        const remaining = await db
          .select({ attemptId: signupAttempts.attemptId })
          .from(signupAttempts)
          .where(inArray(signupAttempts.attemptId, [expiredAttemptId, consumedAttemptId, pendingAttemptId]));
        const remainingIds = remaining.map((r) => r.attemptId);
        expect(remainingIds).not.toContain(expiredAttemptId);
        expect(remainingIds).not.toContain(consumedAttemptId);
        expect(remainingIds).toContain(pendingAttemptId);
      } finally {
        await db.delete(signupAttempts).where(inArray(signupAttempts.attemptId, [pendingAttemptId]));
        await db.delete(user).where(inArray(user.id, [ownerId]));
      }
    },
  );
});
