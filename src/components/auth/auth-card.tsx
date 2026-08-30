"use client";
import { useEffect, useState, type FormEvent } from "react";

import { authClient } from "@/lib/auth/client";
import type { AuthProviderId, AuthProviderLink } from "@/lib/auth/providers";
import type { SignupMode } from "@/lib/auth/signup-mode";
import {
  trackSignInSubmitted,
  trackSignInSucceeded,
  trackSignInFailed,
  trackSignUpSubmitted,
  trackSignUpAccepted,
  trackSignUpFailed,
} from "@/lib/analytics-events";

/**
 * Client-side pre-check mirroring better-auth's own `minPasswordLength: 8`
 * (src/lib/auth/setup.ts). Purely a fast-fail UX nicety — the server-side
 * check is still the source of truth (AC-3), enforced by better-auth
 * itself regardless of what this function returns.
 */
export function isPasswordLongEnough(password: string): boolean {
  return password.length >= 8;
}

/**
 * Maps better-auth's error codes (verified against the installed
 * @better-auth/core source — see docs/superpowers/specs/2026-08-05-open-signup-design.md
 * §1/§4/§6.2) to user-facing copy. `INVALID_EMAIL_OR_PASSWORD` is
 * deliberately generic — never reveal whether an email is registered
 * (AC-6). Falls back to the server-supplied message (or a generic string)
 * for any code this mapping doesn't explicitly know about, so a future
 * better-auth error surfaces *something* readable rather than nothing.
 */
export function mapAuthErrorMessage(code: string | undefined, fallback?: string): string {
  switch (code) {
    case "INVALID_EMAIL":
      return "Enter a valid email address.";
    case "PASSWORD_TOO_SHORT":
      return "Password must be at least 8 characters.";
    // email-verification-gate design doc §0/§5: with
    // requireEmailVerification: true, better-auth's duplicate-email
    // sign-up branch returns a generic synthetic-success response, not
    // this error code — so this case is unreachable from handleSignUp
    // below. Left in place (not deleted) since it's still the correct,
    // non-enumerating mapping for this code wherever else better-auth
    // might surface it, and the existing test asserts it.
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "An account with that email already exists — sign in instead.";
    case "INVALID_EMAIL_OR_PASSWORD":
      return "Check your email and password and try again.";
    default:
      return fallback || "Something went wrong. Please try again.";
  }
}

/**
 * Same-browser live-sync message contract (email-verification-gate design
 * doc §3). App-owned, native `BroadcastChannel` — deliberately NOT
 * better-auth's own internal localStorage-based shim, which only fires for
 * /sign-out, /update-user, /update-session (never /verify-email — see
 * design doc §1's grounding). `correlationId` is required so a message
 * only resolves the one waiting tab it belongs to (AC-11) — a bare
 * "something changed" event would be insufficient and, per §2.1's
 * security invariant, must never be looked up/matched by email.
 */
export const FOLIO_AUTH_CHANNEL_NAME = "folio-auth";

export type EmailVerifiedBroadcastMessage = {
  type: "email-verified";
  correlationId: string;
};

export function isEmailVerifiedBroadcastMessage(
  data: unknown,
): data is EmailVerifiedBroadcastMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === "email-verified" &&
    typeof (data as { correlationId?: unknown }).correlationId === "string"
  );
}

/**
 * Shared `callbackURL` construction (design doc §2.2/§3) — used both for
 * the fresh-signup `signupAttemptId` (cross-device grant + same-browser
 * sync) and the blocked-sign-in/resend `verifyWatchId` (same-browser sync
 * only, §2.3's deliberate cross-device-scope exclusion). Verified-in-source
 * carrier: better-auth's own `/verify-email` redirect always lands on this
 * exact URL, appending `&error=<CODE>` on failure (design doc §1).
 */
export function buildVerifyEmailCallbackURL(correlationId: string): string {
  return `/verify-email?attemptId=${encodeURIComponent(correlationId)}`;
}

// Cross-device poll loop constants (design doc §2.3).
export const SIGNUP_ATTEMPT_POLL_INTERVAL_MS = 3000;
export const SIGNUP_ATTEMPT_POLL_TIMEOUT_MS = 10 * 60 * 1000;

export function hasSignupAttemptPollTimedOut(startedAtMs: number, nowMs: number): boolean {
  return nowMs - startedAtMs >= SIGNUP_ATTEMPT_POLL_TIMEOUT_MS;
}

/**
 * better-auth's own `EMAIL_NOT_VERIFIED` error code
 * (node_modules/better-auth/dist/api/routes/sign-in.mjs:229-241, thrown as
 * `APIError.from("FORBIDDEN", BASE_ERROR_CODES.EMAIL_NOT_VERIFIED)` — the
 * `"FORBIDDEN"` there is the HTTP status, not the error `code`; the code
 * field on the client-side error is `"EMAIL_NOT_VERIFIED"`, verified via
 * `@better-auth/core`'s `defineErrorCodes` helper). Replaces the removed
 * `unverifiedNudge` branch (design doc §5) — a sign-in that used to
 * succeed-with-a-nudge now hard-rejects with this code instead.
 */
export function isEmailNotVerifiedSignInError(code: string | undefined): boolean {
  return code === "EMAIL_NOT_VERIFIED";
}

export type WaitStateVariant = "signup" | "blocked-sign-in";

// Anti-enumeration copy (design doc §5): mirrors the already-established
// forgot-password phrasing pattern ("If an account exists for that email,
// a reset link is on its way.") — must not confirm/deny account
// existence, since a duplicate sign-up now returns the same generic
// success response as a genuine one (AC-4).
export const SIGNUP_WAIT_MESSAGE =
  "If an account can be created for that email, we've sent a link to verify it.";

// Copy-honesty (AC-7/AC-15): unlike the old unverifiedNudge banner, this
// must never imply access is available — the sign-in call already
// hard-rejected.
export const BLOCKED_SIGN_IN_WAIT_MESSAGE =
  "Your email hasn't been verified yet. Check your inbox for the verification link, or resend it below.";

export function waitStateMessage(variant: WaitStateVariant): string {
  return variant === "signup" ? SIGNUP_WAIT_MESSAGE : BLOCKED_SIGN_IN_WAIT_MESSAGE;
}

export type ClaimStatus = "pending" | "granted";

/**
 * Fail-safe parsing of `POST /api/auth/signup-attempt/claim` responses:
 * anything other than an explicit `{status: "granted"}` is treated as
 * "pending," never as "granted" — a malformed/unexpected body must never
 * be mistaken for a session grant.
 */
export function parseClaimResponseStatus(body: unknown): ClaimStatus {
  return typeof body === "object" &&
    body !== null &&
    (body as { status?: unknown }).status === "granted"
    ? "granted"
    : "pending";
}

const PROVIDER_LABEL_CLASS: Record<AuthProviderId, string> = {
  google: "bg-mint text-bg",
  github: "border border-borderHard text-ink",
};

export type Tab = "sign-in" | "sign-up";

export function AuthCard({
  providers,
  signupMode,
  initialTab = "sign-in",
}: {
  providers: AuthProviderLink[];
  signupMode: SignupMode;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Replaces the removed `unverifiedNudge` (design doc §5/Open Question
  // 4) — one shared wait-state UI for both the fresh-signup case and the
  // now-hard-blocked sign-in case, distinguished only by `variant`.
  // `correlationId` is `null` only for a freshly-entered blocked-sign-in
  // state, before the first resend has minted one (design doc §3).
  const [waitState, setWaitState] = useState<
    | { variant: "signup"; correlationId: string; startedAtMs: number }
    | { variant: "blocked-sign-in"; correlationId: string | null }
    | null
  >(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  const [resendError, setResendError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotStatus, setForgotStatus] = useState<"idle" | "sending" | "sent">("idle");

  const activeCorrelationId = waitState?.correlationId ?? null;

  // Same-browser live sync (design doc §3): listens on the shared
  // `folio-auth` channel for the message the /verify-email landing page
  // (or, for a resend, a future one) posts once verification succeeds.
  // Resolves near-instantly, well before the cross-device poll loop below
  // would otherwise notice — matches on `correlationId` so a second
  // waiting tab for a *different* email is never misled (AC-11).
  useEffect(() => {
    if (!activeCorrelationId || typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(FOLIO_AUTH_CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent) => {
      if (isEmailVerifiedBroadcastMessage(event.data) && event.data.correlationId === activeCorrelationId) {
        window.location.href = "/dashboard";
      }
    };
    return () => channel.close();
  }, [activeCorrelationId]);

  // Cross-device session grant (design doc §2.3): fresh-signup only —
  // polls the rate-limited claim endpoint every 3s, pausing while the tab
  // is backgrounded (Page Visibility API) and giving up after 10 minutes.
  // "pending" covers not-found/expired/still-unverified alike by
  // construction (server-side, §2.2) — this loop never needs to know why.
  useEffect(() => {
    if (!waitState || waitState.variant !== "signup") return;
    const { correlationId, startedAtMs } = waitState;
    let cancelled = false;

    async function poll() {
      if (cancelled || document.visibilityState !== "visible") return;
      if (hasSignupAttemptPollTimedOut(startedAtMs, Date.now())) return;
      try {
        const res = await fetch("/api/auth/signup-attempt/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attemptId: correlationId }),
        });
        const body: unknown = await res.json().catch(() => null);
        if (!cancelled && parseClaimResponseStatus(body) === "granted") {
          window.location.href = "/dashboard";
        }
      } catch {
        // Background convenience only — next tick retries; the
        // last-resort fallback (§2.3/AC-15) is always "sign in again
        // once verified," so a transient network error here is silent.
      }
    }

    const intervalId = setInterval(poll, SIGNUP_ATTEMPT_POLL_INTERVAL_MS);
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") void poll();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [waitState]);

  async function handleOAuth(provider: AuthProviderId) {
    setError(null);
    await authClient.signIn.social({ provider, callbackURL: "/dashboard" });
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setWaitState(null);
    setPending(true);
    trackSignInSubmitted();
    try {
      const { error: signInError } = await authClient.signIn.email({ email, password });
      if (signInError) {
        if (isEmailNotVerifiedSignInError(signInError.code)) {
          // AC-7: sign-in on an unverified account now hard-rejects
          // (better-auth's own FORBIDDEN/EMAIL_NOT_VERIFIED,
          // sign-in.mjs:229-241) instead of succeeding into a nudge —
          // reuse the shared wait state. No correlation id yet: no email
          // has been (re)sent as part of *this* request (design doc §3).
          setResendState("idle");
          setResendError(null);
          setWaitState({ variant: "blocked-sign-in", correlationId: null });
          trackSignInFailed("email_not_verified");
          return;
        }
        setError(mapAuthErrorMessage(signInError.code, signInError.message));
        trackSignInFailed("invalid_credentials");
        return;
      }
      trackSignInSucceeded();
      window.location.href = "/dashboard";
    } finally {
      setPending(false);
    }
  }

  async function handleSignUp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isPasswordLongEnough(password)) {
      setError(mapAuthErrorMessage("PASSWORD_TOO_SHORT"));
      trackSignUpFailed();
      return;
    }
    setPending(true);
    trackSignUpSubmitted();
    try {
      const signupAttemptId = crypto.randomUUID();
      // better-auth requires `name`; this app has no separate "display
      // name" field on the sign-up form, so default it to the local part
      // of the email — same as a user could later rename it in Settings.
      const { error: signUpError } = await authClient.signUp.email({
        email,
        password,
        name: email.split("@")[0] || email,
        callbackURL: buildVerifyEmailCallbackURL(signupAttemptId),
        // Ordinary extra body field, not a named better-auth field
        // (design doc §2.2) — bound server-side to the just-created user
        // row by databaseHooks.user.create.after; never looked up by
        // email (§2.1's account-takeover-preventing invariant). The
        // generated client type only exposes the named fields at the
        // top level (they become `body` via proxy.mjs's `{...body,
        // ...options?.body}` merge) — `fetchOptions.body` is the
        // documented passthrough for the endpoint's own
        // `.and(z.record(z.string(), z.any()))` schema (design doc §1).
        fetchOptions: { body: { signupAttemptId } },
      });
      if (signUpError) {
        setError(mapAuthErrorMessage(signUpError.code, signUpError.message));
        trackSignUpFailed();
        return;
      }
      // AC-1/AC-2/AC-4: no redirect, and no distinction between a
      // genuine and a duplicate-email sign-up — both return the same
      // generic response (requireEmailVerification: true's
      // shouldReturnGenericDuplicateResponse, design doc §0/§1) and both
      // show the same waiting state (anti-enumeration).
      setResendState("idle");
      setResendError(null);
      setWaitState({ variant: "signup", correlationId: signupAttemptId, startedAtMs: Date.now() });
      trackSignUpAccepted();
    } finally {
      setPending(false);
    }
  }

  async function handleResendVerification() {
    if (!waitState) return;
    setResendState("sending");
    setResendError(null);
    // Signup variant reuses its original signupAttemptId (the
    // server-side signupAttempts row / cross-device poll loop are keyed
    // on it, §2.3) — only the blocked-sign-in variant, which has no
    // server-side row at all, mints a fresh verifyWatchId per send
    // (design doc §3).
    const correlationId =
      waitState.variant === "signup" ? waitState.correlationId : crypto.randomUUID();
    if (waitState.variant === "blocked-sign-in") {
      setWaitState({ variant: "blocked-sign-in", correlationId });
    }
    const { error: resendErr } = await authClient.sendVerificationEmail({
      email,
      callbackURL: buildVerifyEmailCallbackURL(correlationId),
    });
    if (resendErr) {
      // Rate-limit responses carry no `code`, only a plain "Too many
      // requests..." message (better-auth's rate-limiter, verified
      // in-source) — mapAuthErrorMessage's fallback surfaces it verbatim
      // rather than a generic failure (AC-3).
      setResendError(mapAuthErrorMessage(resendErr.code, resendErr.message));
      setResendState("idle");
      return;
    }
    setResendState("sent");
  }

  async function handleForgotPassword(e: FormEvent) {
    e.preventDefault();
    setForgotStatus("sending");
    // Anti-enumeration (AC-17): better-auth returns the same shape whether
    // or not the email has an account — we display the message verbatim,
    // no client-side branching on the result.
    await authClient.requestPasswordReset({ email: forgotEmail, redirectTo: "/reset-password" });
    setForgotStatus("sent");
  }

  return (
    <div className="bg-panel border border-border rounded-2xl p-6 sm:p-7 space-y-4">
      <div className="flex items-center gap-2">
        <TabButton active={tab === "sign-in"} onClick={() => { setTab("sign-in"); setError(null); }}>
          Sign in
        </TabButton>
        <TabButton active={tab === "sign-up"} onClick={() => { setTab("sign-up"); setError(null); }}>
          Create account
        </TabButton>
      </div>

      {providers.length > 0 && (
        <div className="space-y-2.5">
          {providers.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handleOAuth(p.id)}
              className={`block w-full text-center font-mono text-xs uppercase tracking-widest py-3 rounded-lg font-semibold ${PROVIDER_LABEL_CLASS[p.id]}`}
            >
              {p.label}
            </button>
          ))}
          <div className="flex items-center gap-3 text-dim text-[11px] font-mono uppercase tracking-widest">
            <div className="h-px bg-border flex-1" />
            or
            <div className="h-px bg-border flex-1" />
          </div>
        </div>
      )}

      {waitState ? (
        <div className="space-y-3">
          <div className="px-3 py-2.5 rounded-lg bg-amber/10 border border-amber/30 text-amber text-[13px] leading-relaxed">
            {waitStateMessage(waitState.variant)}
          </div>
          {resendError && (
            <div className="px-3 py-2 rounded-lg bg-bad/10 border border-bad/30 text-bad text-[12px] font-mono">
              {resendError}
            </div>
          )}
          <button
            type="button"
            onClick={handleResendVerification}
            disabled={resendState === "sending"}
            className="w-full border border-borderHard text-ink font-mono text-xs uppercase tracking-widest py-2.5 rounded-lg disabled:opacity-50"
          >
            {resendState === "sent" ? "Verification email sent" : resendState === "sending" ? "Sending…" : "Resend verification email"}
          </button>
          <button
            type="button"
            onClick={() => { setWaitState(null); setResendState("idle"); setResendError(null); }}
            className="w-full text-center text-muted text-[12px] font-mono"
          >
            ← Back to sign in
          </button>
        </div>
      ) : forgotOpen ? (
        <form onSubmit={handleForgotPassword} className="space-y-3">
          {forgotStatus === "sent" ? (
            <div className="px-3 py-2.5 rounded-lg bg-mint/10 border border-mint/30 text-mint text-[13px] leading-relaxed">
              If an account exists for that email, a reset link is on its way.
            </div>
          ) : (
            <>
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                className="w-full bg-panel2 border border-borderHard rounded-lg px-3 py-2.5 text-sm font-mono"
              />
              <button
                type="submit"
                disabled={forgotStatus === "sending"}
                className="w-full bg-mint text-bg font-mono text-xs uppercase tracking-widest py-3 rounded-lg font-semibold disabled:opacity-50"
              >
                {forgotStatus === "sending" ? "Sending…" : "Send reset link"}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => { setForgotOpen(false); setForgotStatus("idle"); }}
            className="w-full text-center text-muted text-[12px] font-mono"
          >
            ← Back to sign in
          </button>
        </form>
      ) : (
        <form onSubmit={tab === "sign-in" ? handleSignIn : handleSignUp} className="space-y-2.5">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-panel2 border border-borderHard rounded-lg px-3 py-2.5 text-sm font-mono"
          />
          <input
            type="password"
            name="password"
            autoComplete={tab === "sign-in" ? "current-password" : "new-password"}
            required
            placeholder="Password (min. 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-panel2 border border-borderHard rounded-lg px-3 py-2.5 text-sm font-mono"
          />
          {error && (
            <div className="px-3 py-2 rounded-lg bg-bad/10 border border-bad/30 text-bad text-[12px] font-mono">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={pending}
            className="block w-full text-center bg-mint text-bg font-mono text-xs uppercase tracking-widest py-3 rounded-lg font-semibold disabled:opacity-50"
          >
            {pending ? "…" : tab === "sign-in" ? "Sign in" : "Create account"}
          </button>
          {tab === "sign-in" && (
            <button
              type="button"
              onClick={() => { setForgotOpen(true); setForgotEmail(email); }}
              className="w-full text-center text-muted text-[12px] font-mono"
            >
              Forgot password?
            </button>
          )}
        </form>
      )}

      {signupMode === "restricted" && (
        <p className="text-muted text-[12px] leading-relaxed">
          Sign-up is currently restricted to invited emails. Ask an admin to add yours.
        </p>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 font-mono text-[11px] uppercase tracking-widest py-2 rounded-lg ${
        active ? "bg-panel2 text-ink" : "text-muted"
      }`}
    >
      {children}
    </button>
  );
}
