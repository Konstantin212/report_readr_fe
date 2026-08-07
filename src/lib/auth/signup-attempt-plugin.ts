import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import * as z from "zod";

import { getDb } from "@/lib/db/client";
import { signupAttempts, user } from "@/lib/db/schema";
import type { Db } from "./auth-cleanup";

export type ClaimStatus = "pending" | "granted";

/**
 * Core claim logic (email-verification-gate design doc §2.2, steps 1-4).
 * Extracted from the better-auth endpoint wiring below so it's
 * unit-testable against a mocked `Db` and a mocked session-minting
 * callback, without constructing a full better-auth `ctx`.
 *
 * `mintSession` is injected — the real endpoint wires it to
 * `ctx.context.internalAdapter.createSession` + `setSessionCookie`
 * (mirrors `plugins/email-otp/routes.mjs:307-330` verbatim, per the
 * design doc's grounding).
 *
 * Anti-enumeration (AC-14): looks up only by the opaque `attemptId`,
 * never by email. "Not found" / "expired" / "still unverified" all
 * collapse into the same `"pending"` response — a caller can never
 * distinguish "this attemptId doesn't exist" from "it exists but hasn't
 * verified yet", which would otherwise leak information about
 * valid-id shape (design doc §2.2 step 2).
 */
export async function claimSignupAttempt(
  db: Db,
  attemptId: string,
  mintSession: (userId: string) => Promise<void>,
): Promise<ClaimStatus> {
  const rows = await db
    .select({
      userId: user.id,
      emailVerified: user.emailVerified,
    })
    .from(signupAttempts)
    .innerJoin(user, eq(signupAttempts.userId, user.id))
    .where(
      and(
        eq(signupAttempts.attemptId, attemptId),
        isNull(signupAttempts.consumedAt),
        gt(signupAttempts.expiresAt, sql`now()`),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row || !row.emailVerified) {
    return "pending";
  }

  // Atomic, race-safe one-time-use guard: only the request that actually
  // flips `consumed_at` (row count > 0) gets to mint a session — a
  // second, concurrent claim of the same attempt loses the race and
  // falls back to "pending" rather than minting a second session
  // (design doc §2.2 step 4).
  const claimed = await db
    .update(signupAttempts)
    .set({ consumedAt: sql`now()` })
    .where(and(eq(signupAttempts.attemptId, attemptId), isNull(signupAttempts.consumedAt)))
    .returning({ id: signupAttempts.id });

  if (claimed.length === 0) {
    return "pending";
  }

  await mintSession(row.userId);
  return "granted";
}

const claimBodySchema = z.object({
  attemptId: z.string().min(1),
});

/**
 * `POST /signup-attempt/claim` — the cross-device session-grant exchange
 * endpoint (AC-13/AC-14). See `claimSignupAttempt` above for the core
 * logic; this factory only wires it to better-auth's plugin/endpoint
 * machinery and declares the rate-limit rule.
 *
 * `window: 30, max: 15` bounds abuse while comfortably supporting a
 * client poll interval of 2-3s (design doc §2.2). FLAGGED for
 * `nextjs-security`/`code-reviewer` sign-off on the exact numbers, per
 * this repo's established practice of not silently finalizing
 * security-relevant rate-limit constants (see design doc §7.1 of the
 * 2026-08-05 open-signup design, which flagged its own rule set the same
 * way).
 *
 * `originCheckMiddleware` (same-origin enforcement) applies globally to
 * every route including this one — verified in
 * `node_modules/better-auth/dist/api/index.mjs:149-190` (design doc §1)
 * — so no extra origin check is added here.
 */
export function signupAttemptExchange(): BetterAuthPlugin {
  return {
    id: "signup-attempt-exchange",
    endpoints: {
      claimSignupAttempt: createAuthEndpoint(
        "/signup-attempt/claim",
        {
          method: "POST",
          body: claimBodySchema,
        },
        async (ctx) => {
          const db = getDb();
          const status = await claimSignupAttempt(db, ctx.body.attemptId, async (userId) => {
            const session = await ctx.context.internalAdapter.createSession(userId);
            const mintedUser = await ctx.context.internalAdapter.findUserById(userId);
            if (session && mintedUser) {
              await setSessionCookie(ctx, { session, user: mintedUser });
            }
          });
          return ctx.json({ status });
        },
      ),
    },
    rateLimit: [
      {
        pathMatcher: (path: string) => path === "/signup-attempt/claim",
        window: 30,
        max: 15,
      },
    ],
  };
}
