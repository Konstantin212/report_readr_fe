"use client";
import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { FOLIO_AUTH_CHANNEL_NAME, type EmailVerifiedBroadcastMessage } from "@/components/auth/auth-card";
import { isInvalidVerifyEmailLink } from "@/lib/auth/verify-email-link";

/**
 * AC-9/AC-10/AC-16/AC-17/AC-18/AC-19 (email-verification-gate design doc
 * §4): the landing target of the emailed `/verify-email` link. better-auth's
 * own GET route (email-verification.mjs) does all the actual verification
 * server-side — on success it sets `emailVerified: true`, mints a session
 * via `autoSignInAfterVerification` (design doc §1), and redirects here
 * with `?attemptId=<id>` preserved (the `callbackURL` we built in
 * `auth-card.tsx`); on failure it appends `&error=<CODE>` to that same
 * URL. So this page never itself talks to the verification endpoint — it
 * only reads the two query params already resolved by better-auth.
 *
 * `TOKEN_EXPIRED` (AC-16), `INVALID_TOKEN` (AC-19), `USER_NOT_FOUND`
 * (AC-18), and no `attemptId` at all collapse into the exact same generic
 * "link expired or already used" branch — deliberately not distinguished
 * (AC-18's anti-enumeration requirement: a distinct message for
 * `USER_NOT_FOUND` would leak account-existence information), mirroring
 * `reset-password/page.tsx`'s `invalidToken` branch pattern.
 *
 * Already-verified reuse (AC-17) needs no special case: better-auth's own
 * route treats it as idempotent success (§1), so it never appends
 * `error=`, and this page's success branch runs exactly as it would for a
 * first-time verification.
 *
 * Wrapped in Suspense because `useSearchParams()` requires it for this
 * otherwise-static client page to build (Next.js App Router convention,
 * same as `reset-password/page.tsx`).
 */
export default function VerifyEmailPage() {
  return (
    <main className="min-h-screen">
      <div className="max-w-[440px] mx-auto px-5 sm:px-7 py-10 sm:py-16">
        <Suspense fallback={null}>
          <VerifyEmailCard />
        </Suspense>
      </div>
    </main>
  );
}

function VerifyEmailCard() {
  const params = useSearchParams();
  const attemptId = params.get("attemptId");
  const linkError = params.get("error");
  const invalid = isInvalidVerifyEmailLink({ attemptId, error: linkError });

  useEffect(() => {
    if (invalid || !attemptId) return;
    // Same-browser live sync (design doc §3): notify a waiting
    // sign-up/blocked-sign-in tab in this browser, if any, then proceed —
    // this also covers a click that happens in a third, listener-less
    // tab, which just redirects straight through.
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(FOLIO_AUTH_CHANNEL_NAME);
      const message: EmailVerifiedBroadcastMessage = { type: "email-verified", correlationId: attemptId };
      channel.postMessage(message);
      channel.close();
    }
    // AC-10: the session cookie is already set in this tab
    // (autoSignInAfterVerification, design doc §1) — proceed straight
    // into the app.
    window.location.href = "/dashboard";
  }, [invalid, attemptId]);

  if (invalid) {
    return (
      <div className="bg-panel border border-border rounded-2xl p-6 sm:p-7 space-y-4">
        <div className="font-bold text-[22px] tracking-tight">Link expired or already used</div>
        <p className="text-muted text-[13px] leading-relaxed">
          This verification link is no longer valid. Sign in to request a new one.
        </p>
        <a
          href="/sign-in"
          className="block w-full text-center bg-mint text-bg font-mono text-xs uppercase tracking-widest py-3 rounded-lg font-semibold"
        >
          Back to sign in
        </a>
      </div>
    );
  }

  return (
    <div className="bg-panel border border-border rounded-2xl p-6 sm:p-7 space-y-4">
      <div className="font-bold text-[22px] tracking-tight">Email verified</div>
      <p className="text-muted text-[13px] leading-relaxed">Redirecting you into Folio…</p>
    </div>
  );
}
