import { eq } from "drizzle-orm";

import { signupAttempts, user } from "@/lib/db/schema";
import type { Db } from "./auth-cleanup";

/**
 * Matches `emailVerification.expiresIn` (setup.ts) — the correlation row
 * has no reason to outlive the verification token it's waiting on.
 */
export const SIGNUP_ATTEMPT_TTL_MS = 3600 * 1000;

/**
 * `databaseHooks.user.create.after` handler (email-verification-gate
 * design doc §2.2). Extracted to its own module — like `auth-emails.ts`
 * — so it's unit-testable with a mocked `Db` instead of constructing the
 * full `betterAuth()` instance / hitting a real database.
 *
 * Security invariant (design doc §2.1): this only ever runs when
 * better-auth actually calls `internalAdapter.createUser(...)`, which —
 * verified against `node_modules/better-auth/dist/api/routes/sign-up.mjs`
 * — never happens on the duplicate-email branch. So a duplicate sign-up
 * structurally never reaches this function at all, and therefore can
 * never create a `signupAttempts` row. This module does not (and must
 * not) add its own duplicate/email-based guard — the guarantee comes
 * from *not being called*, not from a check inside here.
 *
 * Takes `db` as an explicit parameter (dependency injection) rather than
 * calling `getDb()` internally, purely for testability.
 */
export async function handleUserCreateAfter(
  db: Db,
  createdUser: { id: string; signupAttemptId?: string | null },
): Promise<void> {
  const attemptId = createdUser.signupAttemptId;
  if (!attemptId) {
    return;
  }

  await db.insert(signupAttempts).values({
    attemptId,
    userId: createdUser.id,
    expiresAt: new Date(Date.now() + SIGNUP_ATTEMPT_TTL_MS),
  });

  // Data minimization: the durable copy now lives in `signupAttempts`;
  // null the transient passthrough column on `user` now that it has
  // served its purpose (mirrors the OAuth-token-nulling precedent in
  // `account.create.before`, setup.ts).
  await db.update(user).set({ signupAttemptId: null }).where(eq(user.id, createdUser.id));
}
