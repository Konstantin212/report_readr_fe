import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { getDb } from "@/lib/db/client";
import { signupAttempts, user } from "@/lib/db/schema";

/**
 * SECURITY-INVARIANT test (email-verification-gate design doc §2.1, build
 * sequence §9 step 3): a genuine sign-up must create exactly one
 * `signupAttempts` row bound to the new user id, and a *duplicate*
 * sign-up for an already-registered email must create ZERO rows — never
 * one bound to the pre-existing (potentially victim) account. A naive
 * email-keyed implementation would let an attacker sign up with a
 * victim's email and have their own polling tab silently mint a session
 * for the victim's real account. This is the load-bearing correctness
 * property the whole cross-device grant mechanism depends on.
 *
 * Real-DB integration test, following this repo's existing convention
 * (tests/api/cron/auth-cleanup.test.ts): gated on
 * `it.skipIf(!process.env.DATABASE_URL)` so it exercises the actual
 * better-auth `/sign-up/email` route (not a re-implementation of it)
 * against a real Postgres locally/in CI when DATABASE_URL is set, and is
 * a no-op otherwise.
 */
const RUN_ID = `signup-attempt-invariant:${Date.now()}:${Math.random().toString(36).slice(2)}`;
const allUserIds: string[] = [];
const allAttemptIds: string[] = [];

function testEmail(suffix: string): string {
  return `${RUN_ID}-${suffix}@example.com`.replace(/:/g, "-");
}

async function cleanupAll() {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  await db.delete(signupAttempts).where(inArray(signupAttempts.attemptId, allAttemptIds));
  await db.delete(user).where(inArray(user.id, allUserIds));
}

afterAll(cleanupAll);

describe("signup-attempt security invariant (real DB integration)", () => {
  it.skipIf(!process.env.DATABASE_URL)(
    "genuine sign-up creates exactly one signupAttempts row; duplicate sign-up for the same email creates zero rows",
    async () => {
      const { auth } = await import("@/lib/auth/setup");
      const db = getDb();
      const email = testEmail("genuine-then-duplicate");
      const genuineAttemptId = randomUUID();
      const duplicateAttemptId = randomUUID();
      allAttemptIds.push(genuineAttemptId, duplicateAttemptId);

      try {
        // Genuine sign-up.
        await auth.api.signUpEmail({
          body: {
            name: "Test User",
            email,
            password: "a-strong-password-123",
            signupAttemptId: genuineAttemptId,
          } as never,
        });

        const createdUser = await db.query.user.findFirst({ where: eq(user.email, email) });
        expect(createdUser).toBeDefined();
        if (createdUser) allUserIds.push(createdUser.id);

        const rowsAfterGenuine = await db
          .select()
          .from(signupAttempts)
          .where(eq(signupAttempts.attemptId, genuineAttemptId));
        expect(rowsAfterGenuine).toHaveLength(1);
        expect(rowsAfterGenuine[0].userId).toBe(createdUser?.id);

        // The transient passthrough column must be nulled back out.
        const userAfterGenuine = await db.query.user.findFirst({ where: eq(user.email, email) });
        expect((userAfterGenuine as unknown as { signupAttemptId: string | null })?.signupAttemptId).toBeNull();

        // Duplicate sign-up: same email, a fresh attempt id. better-auth's
        // duplicate-email branch never calls internalAdapter.createUser,
        // so create.after never fires — zero rows for the duplicate
        // attempt id, and the original row is untouched.
        await auth.api.signUpEmail({
          body: {
            name: "Test User",
            email,
            password: "a-different-password-456",
            signupAttemptId: duplicateAttemptId,
          } as never,
        });

        const rowsForDuplicateAttempt = await db
          .select()
          .from(signupAttempts)
          .where(eq(signupAttempts.attemptId, duplicateAttemptId));
        expect(rowsForDuplicateAttempt).toHaveLength(0);

        // Original row still exists, untouched, still bound to the
        // original (only) user id for this email.
        const rowsStillAfterDuplicate = await db
          .select()
          .from(signupAttempts)
          .where(eq(signupAttempts.attemptId, genuineAttemptId));
        expect(rowsStillAfterDuplicate).toHaveLength(1);
        expect(rowsStillAfterDuplicate[0].userId).toBe(createdUser?.id);
      } finally {
        await cleanupAll();
      }
    },
  );
});
