/**
 * Extracted from src/app/verify-email/page.tsx: a Next.js App Router page
 * file may only export the default component plus a small allow-listed
 * set of config fields — `next build`'s own type-checking pass (distinct
 * from `tsc --noEmit`, which doesn't catch this) rejects any other named
 * export with "... is not a valid Page export field". Same constraint
 * documented above `Db` in src/lib/auth/auth-cleanup.ts. Since this
 * predicate needs to be unit-testable independent of rendering the page
 * (see tests/components/auth/verify-email-page.test.ts), it lives here
 * instead and the page just imports it.
 *
 * AC-16/AC-18/AC-19 (email-verification-gate design doc §4): TOKEN_EXPIRED,
 * INVALID_TOKEN, USER_NOT_FOUND, and "no attemptId at all" must all
 * collapse into the same generic "invalid link" branch — anti-enumeration
 * (AC-18 must not get distinct copy that would leak account-existence
 * information).
 */
export function isInvalidVerifyEmailLink(params: {
  attemptId: string | null;
  error: string | null;
}): boolean {
  return !params.attemptId || !!params.error;
}
