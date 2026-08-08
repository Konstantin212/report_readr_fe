import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins/admin";

import { isEmailAllowedToSignIn } from "./allowlist";
import { getSignupMode } from "./signup-mode";
import { sendResetPasswordEmail, sendVerificationEmail } from "./auth-emails";
import { handleUserCreateAfter } from "./signup-attempt-hooks";
import { signupAttemptExchange } from "./signup-attempt-plugin";
import { getDb } from "@/lib/db/client";

function getAuthSecret(): string {
  if (process.env.BETTER_AUTH_SECRET) {
    return process.env.BETTER_AUTH_SECRET;
  }

  if (process.env.VERCEL === "1") {
    throw new Error("BETTER_AUTH_SECRET is required on Vercel.");
  }

  return "local-development-only-secret-replace-before-deploy";
}

function getBaseUrl(): string {
  if (process.env.BETTER_AUTH_URL) {
    return process.env.BETTER_AUTH_URL;
  }

  // Falling back to VERCEL_URL on production is a footgun: VERCEL_URL is
  // the canonical *.vercel.app deployment URL, not whatever custom
  // domain Better Auth's trustedOrigins / cookie scope should match.
  // Require the env var explicitly.
  if (process.env.VERCEL === "1") {
    throw new Error("BETTER_AUTH_URL is required on Vercel (must match your live domain).");
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:3000";
}

function getTrustedOrigins(): string[] {
  return [
    getBaseUrl(),
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    // Domain-migration cutover window only (ptfolio.net) — see design doc
    // §17.4. A verification/reset link emailed *before* BETTER_AUTH_URL is
    // flipped to the new domain bakes in the old base URL (better-auth
    // builds these links from ctx.context.baseURL at send-time, not
    // dynamically at click-time). The GET redirect itself works regardless
    // (origin-check skips GET/HEAD/OPTIONS), but the reset-password page's
    // final POST would carry the old origin and get rejected by
    // originCheckMiddleware unless that old origin stays in
    // trustedOrigins for as long as any link issued before cutover could
    // still be valid (AC-20's TTLs: 1h for both token kinds). Unset once
    // that window has passed — orthogonal to "keep the old *.vercel.app
    // URL serving traffic indefinitely" (that's just VERCEL_URL above).
    process.env.BETTER_AUTH_LEGACY_ORIGIN,
  ].filter(Boolean) as string[];
}

export const auth = betterAuth({
  secret: getAuthSecret(),
  baseURL: getBaseUrl(),
  trustedOrigins: getTrustedOrigins(),
  database: drizzleAdapter(getDb(), {
    provider: "pg",
  }),
  socialProviders: {
    google:
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }
        : undefined,
    github:
      process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
        ? {
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
          }
        : undefined,
  },
  // Open self-service sign-up (see docs/superpowers/specs/2026-08-05-open-signup-design.md),
  // now gated on email verification (see
  // docs/superpowers/specs/2026-08-06-email-verification-gate-ac.md and
  // ...-design.md §0/§9). This REVERSES the prior nudge-only resolution:
  // access is blocked, not just nudged, until the account is verified.
  emailAndPassword: {
    enabled: true,
    // Blocks sign-in on unverified accounts (AC-7: FORBIDDEN/
    // EMAIL_NOT_VERIFIED, sign-in.mjs:229-241) and, as better-auth's own
    // verified side effects (design doc §0), also disables auto-sign-in
    // on brand-new sign-ups (AC-1 — the mechanism that makes the
    // sign-up response carry no session) and makes duplicate-email
    // sign-up return the same generic response as a genuine sign-up
    // (AC-4, `shouldReturnGenericDuplicateResponse`). Both are wanted,
    // not accidental — see the AC/design docs for the full trace.
    requireEmailVerification: true,
    minPasswordLength: 8, // == better-auth's own default; explicit for clarity, not a behavior change
    maxPasswordLength: 128, // == better-auth's own default; explicit for clarity, not a behavior change
    autoSignIn: true, // MUST stay true — see enumeration trade-off in the design doc §4
    revokeSessionsOnPasswordReset: true, // a password reset is often triggered by suspected compromise
    resetPasswordTokenExpiresIn: 3600, // == better-auth's own default; explicit for clarity
    sendResetPassword: async ({ user, url }) => {
      await sendResetPasswordEmail({ user, url });
    },
  },
  emailVerification: {
    sendOnSignUp: true, // AC-14 — unconditional, independent of requireEmailVerification (see above)
    expiresIn: 3600, // == better-auth's own default; explicit for clarity
    // AC-10: the tab that clicks the verification link auto-signs in on
    // that same tab (session cookie set + redirect to callbackURL) — no
    // custom cross-tab mechanism needed for that specific case. See
    // email-verification-gate design doc §1/§4.
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail({ user, url });
    },
  },
  // Cross-device session-grant correlation id (email-verification-gate
  // design doc §2.2). `returned: false` means it never appears in ANY
  // sign-up response shape — genuine or synthetic-duplicate (AC-4) —
  // see @better-auth/core's filterOutputFields, which strips it
  // unconditionally from every output path. Client-generated
  // (crypto.randomUUID()) before calling signUp.email(...); consumed by
  // databaseHooks.user.create.after below.
  user: {
    additionalFields: {
      signupAttemptId: { type: "string", required: false, returned: false },
    },
  },
  // Covers /sign-in*, /sign-up*, and (per better-auth's own default special
  // rules) /request-password-reset + /send-verification-email with a
  // stricter 3-req/60s rule — see design doc §7.1/§15. Explicit rather than
  // relying on the implicit isProduction fallback, matching this file's
  // existing style of being explicit about production-sensitive behavior.
  rateLimit: { enabled: true },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (getSignupMode() === "restricted" && !(await isEmailAllowedToSignIn(user.email))) {
            throw new Error("Email is not authorized for this private app.");
          }

          // admin-panel design doc §3.3: the admin plugin's own init()
          // *also* contributes a databaseHooks.user.create.before that
          // sets `role: options.defaultRole ?? "user"`. Whether
          // better-auth threads that plugin-contributed hook's output
          // into this app-supplied hook's input (so `user.role` would
          // already be "user" here) is an implementation detail we
          // shouldn't trust blind for an AC-1.3 (default-deny)
          // guarantee. Set it explicitly, preserving any role already
          // present (e.g. one set by the plugin hook, or by the
          // bootstrap-admin-roles.ts script re-running against an
          // existing row) rather than clobbering it.
          return { data: { ...user, role: user.role ?? "user" } };
        },
        // Design doc §2.2/§9 build step 3: binds the cross-device
        // correlation id to the just-created user. Only ever fires when
        // better-auth actually calls internalAdapter.createUser(...),
        // which the duplicate-email branch never does — see
        // signup-attempt-hooks.ts's doc-comment for the full security
        // argument (design doc §2.1).
        after: async (createdUser) => {
          await handleUserCreateAfter(
            getDb(),
            createdUser as { id: string; signupAttemptId?: string | null },
          );
        },
      },
    },
    account: {
      create: {
        before: async (account) => {
          // This app never calls back to Google/GitHub APIs post-auth, so
          // persisting their OAuth tokens serves no purpose — pure data
          // minimization (design doc §24). Credential (email+password)
          // rows are untouched: that branch's `password` column is the
          // one token-shaped field it actually needs.
          if (account.providerId !== "credential") {
            return { data: { ...account, accessToken: null, refreshToken: null, idToken: null } };
          }

          return { data: account };
        },
      },
    },
  },
  // Cross-device sign-up session-grant exchange endpoint (AC-13/AC-14) —
  // see signup-attempt-plugin.ts and design doc §2.2.
  //
  // admin-panel design doc §0/§3.3: adopts `better-auth/plugins/admin`
  // narrowly, for its `role` column concept and its impersonation
  // session-swap mechanism only — list/edit/delete go through hand-rolled
  // Drizzle queries under our own guard instead of the plugin's generic
  // REST endpoints (see lib/data/admin-users.ts, lib/auth/require-admin.ts,
  // app/api/admin/panel/**). `allowImpersonatingAdmins: false` means the
  // plugin itself refuses to let an admin impersonate another admin.
  // `impersonationSessionDuration: 1800` (30 min) is deliberately shorter
  // than this app's other 1-hour financial/tax-facing token TTLs — an
  // impersonated session is a higher-privilege, more sensitive state.
  plugins: [
    signupAttemptExchange(),
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
      allowImpersonatingAdmins: false,
      impersonationSessionDuration: 1800,
    }),
  ],
});
