# Open Self-Service Sign-Up — Acceptance Criteria

**Date:** 2026-08-05
**Status:** Draft — ready for architect
**Author:** business-analyst
**Amended:** 2026-08-05 (same-day amendment — see "Amendment 1" below; AC-14
onward)
**Related:** `src/lib/auth/setup.ts`, `src/lib/auth/allowlist.ts`, `src/lib/auth/admin.ts`,
`src/lib/auth/providers.ts`, `src/lib/auth/server.ts`, `src/lib/env.ts`,
`src/lib/db/schema.ts` (`user`, `allowedEmails`), `src/app/sign-in/page.tsx`,
`src/components/pulse/members-manager.tsx`, `src/app/api/admin/allowlist/*`.
Amendment 1 additionally touches: `src/lib/email/resend.ts`,
`src/lib/auth/auth-emails.ts`, `src/lib/auth/cron.ts`, Vercel domain/DNS
configuration, and Vercel/`.env.local` environment variables
(`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `BETTER_AUTH_URL`).

No existing doc in `docs/INDEX.md` covers auth/sign-up business logic — this is
new ground, not a duplicate of `elster-anlage-kap-2025-gaps.md` or
`vorabpauschale-design.md` (tax-only) or the portfolio/Pulse design specs
(auth is mentioned there only as a dependency, not specified). This doc is the
first business-logic doc for auth and should be added to `docs/INDEX.md` by
`documentation-writer` once implemented.

## Amendment 1 (2026-08-05): real email delivery, custom domain, data-lifecycle docs

This is an amendment to the same feature, not a new one — appended per
`documentation-standards`' single-source-of-truth rule rather than forking a
second doc. It extends the original AC-1…AC-13 (unchanged below) with three
additions the user has now requested, added as new subsections under
Section 5 (AC-14 onward), with corresponding updates to Scope (Section 3),
Open Questions (Section 6), Risks (Section 7), Traceability (Section 8), and
Documentation follow-up (Section 9):

1. **Real email verification + password reset**, now that Resend
   infrastructure is provisioned (§5.8) — this reverses the original
   "explicitly out of scope" calls on password reset and email verification
   (Section 3 originally, now superseded — see the strikethrough-style notes
   left in place there for history rather than silently deleted).
2. **Custom domain migration** off `*.vercel.app` onto a domain under
   `ptfolio.net` (§5.9).
3. **Data-processes / data-lifecycle documentation deliverable** — an
   inventory of every process and every stored/handled/erased data item this
   feature (original + amendment) introduces (§5.10).

Grounding for this amendment (confirmed by reading the actual codebase, not
assumed):
- `src/lib/email/resend.ts` and `src/lib/auth/auth-emails.ts` **already
  exist** — a thin `sendEmail()` wrapper around the `resend` SDK
  (`package.json`: `"resend": "^6.18.1"`) and standalone
  `sendVerificationEmail`/`sendResetPassword` HTML-body functions, both with
  passing unit tests (`tests/lib/email/resend.test.ts`,
  `tests/auth/auth-emails.test.ts`). This is the "infra provisioned" state
  the task described — the email-sending capability exists and is tested in
  isolation, but is **not yet wired into `betterAuth({...})`** in
  `src/lib/auth/setup.ts`, which today still has no `emailAndPassword` block
  at all and still hard-throws `"Email is not authorized for this private
  app."` unconditionally. Wiring is an architect/developer task, not
  something to assert here.
- `src/lib/auth/cron.ts` **today contains only** a constant-time
  `CRON_SECRET` bearer-token check (`hasValidCronSecret`), used by the
  `quotes`/`fx`/`coinbase` sync cron routes and a handful of admin backfill
  routes. It does **not** currently do any auth-data cleanup (no
  token-expiry sweep, no abandoned-signup purge). This is stated as fact for
  AC-28 below, not assumed.
- `src/lib/env.ts`'s Zod schema and `src/lib/auth/setup.ts` still reflect the
  **pre-open-signup** state (`AUTHORIZED_EMAILS: z.string().min(1)`
  required; no `AUTH_SIGNUP_MODE`) — i.e. as of this amendment, the original
  AC-1…AC-13 / design-doc work has not yet been implemented either. This
  amendment's AC therefore assume the original feature ships alongside it,
  not that it's already live.

## 1. Current state (confirmed, not to be re-derived)

- Sign-in today is **OAuth-only** (`/sign-in`, `src/app/sign-in/page.tsx`):
  Google/GitHub buttons, gated by `getEnabledAuthProviders()` on env presence.
  The page copy literally states the app is **"invite-only."**
- `betterAuth({...})` (`src/lib/auth/setup.ts`) has **no `emailAndPassword`
  provider configured** — password sign-up/sign-in does not exist anywhere
  in the app today.
- Every new user — OAuth is the only path today — is gated by a
  `databaseHooks.user.create.before` hook that calls
  `isEmailAllowedToSignIn(user.email)` (`src/lib/auth/allowlist.ts`) and
  throws `"Email is not authorized for this private app."` if the email is
  in neither the `AUTHORIZED_EMAILS` env var nor the `allowed_emails` DB
  table.
- `allowed_emails` rows are managed by an **admin-only** Settings → Members
  UI (`src/components/pulse/members-manager.tsx`,
  `src/app/api/admin/allowlist/**`), gated separately by `isAdminEmail()`
  (`src/lib/auth/admin.ts`, driven by `ADMIN_EMAILS` env var — **this is a
  distinct mechanism from the sign-up allowlist and is unaffected by this
  feature**). The Members UI copy currently says "Invite" and "share
  `/sign-in` with them," i.e. it presents allowlisting as a prerequisite for
  sign-in.
- `AUTHORIZED_EMAILS` is a **required, non-optional** field in the Zod env
  schema (`src/lib/env.ts`): `z.string().min(1)`. The app **fails to boot**
  without it today.
- No rate limiting or CAPTCHA exists anywhere in the codebase (confirmed —
  no `rate-limit`/`ratelimit` hits in `src/`). **(Amendment 1 update:** an
  outbound email-sending provider now *does* exist — see "Amendment 1"
  above — this bullet originally also said no such provider existed; that
  is no longer true as of this amendment and is superseded by §5.8's
  grounding notes, kept here unedited for history per the changelog
  discipline of not silently rewriting prior statements.)
- `user.emailVerified` exists in the schema but is always `false` today
  (unused, since no password flow exists to make verification meaningful).
  **(Amendment 1:** this changes under §5.8 — see AC-14/AC-16.)

## 2. Goal

As the app owner, I want any external visitor to be able to create their own
account — via Google, GitHub, **or** email+password — and start using the
app immediately, with no manual admin approval step and no email-verification
step, so that the app can move from a private 5-user tool to a publicly
self-serviceable product.

**(Amendment 1 note:** the "no email-verification step" clause above is the
*original* request. Per the new user request driving this amendment, real
email verification is now being added — see §5.8. The two are reconciled via
Open Question 6 (§6): verification email sending is unconditionally in
scope now, but whether it *blocks* credential sign-in is still an open,
either-resolution-acceptable decision, same shape as the original AC-4.)

## 3. Scope

### In scope

- Removing the admin-approval gate as the **default** behavior for all
  sign-up paths (OAuth and the new email+password path).
- Adding a working `emailAndPassword` sign-up **and** sign-in flow.
- Updating the sign-in page (and/or a new sign-up entry point) so its copy
  no longer claims the app is invite-only.
- Making `AUTHORIZED_EMAILS` optional at the env-schema level without
  breaking existing deployments that still set it.
- Preserving the allowlist mechanism (table, admin UI, hook) as a **kept,
  not-deleted** capability — see Section 6, Open Question 1, for the exact
  disposition the architect must decide.
- **(Amendment 1, new)** Real email verification on email+password sign-up,
  sent via the already-provisioned Resend integration (§5.8).
- **(Amendment 1, new)** Real "forgot password" request + reset flow, sent
  via the same Resend integration (§5.8) — this **supersedes** the
  "Explicitly out of scope" bullet below, kept in place for history.
- **(Amendment 1, new)** Custom domain migration from the default
  `*.vercel.app` deployment URL onto a domain under the user-owned
  `ptfolio.net` (§5.9).
- **(Amendment 1, new)** A data-processes / data-lifecycle documentation
  deliverable inventorying every process and every stored/handled/erased
  data item this feature introduces (§5.10).

### Explicitly out of scope (flag, don't silently include)

- ~~**Password reset ("forgot password") flow.**~~ **SUPERSEDED by
  Amendment 1 (§5.8/AC-17…AC-20) — now in scope.** Original text, kept for
  history: "The user request did not ask for this, and there is currently
  no outbound-email provider in this codebase at all (no
  Resend/SMTP/nodemailer). Shipping password sign-up without a reset path is
  a real support gap the moment a real external user loses their password —
  flagged for the architect/product owner to decide whether it's a
  fast-follow or must ship together (see Open Question 4)." A Resend
  integration now exists (see "Amendment 1" grounding notes above), closing
  the original blocker.
- **CAPTCHA / bot-abuse protection** for the public sign-up form — still
  flagged as a risk in Section 7, still **not** an AC here; unaffected by
  this amendment.
- ~~**Email-verification-link flow.**~~ **SUPERSEDED by Amendment 1
  (§5.8/AC-14…AC-16) — now in scope.** Original text, kept for history:
  "explicitly requested off; flagged as a risk in Section 7, with the
  toggle preserved for a future fast-follow."
- Any change to the **admin** mechanism (`ADMIN_EMAILS` / `isAdminEmail`) —
  admin-designated users (Members management, backfill routes) are untouched.
  Unaffected by this amendment.
- Any tax/ledger/Anlage logic — this feature does not touch `src/lib/tax`.
  Unaffected by this amendment.
- **(Amendment 1, new)** Writing an actual privacy-policy /
  Datenschutzerklärung page. §5.10/AC-29 requires the *gap* to be
  accurately documented, not closed.
- **(Amendment 1, new)** Deciding, unilaterally, apex-vs-subdomain for the
  custom domain, or the fate of the old `*.vercel.app` URL — both are
  flagged as open questions requiring the user's/architect's explicit
  confirmation (§6, OQ-9/OQ-10), not resolved here.

## 4. Terminology (two independently toggleable things — do not conflate)

- **Admin-approval gate** = today's `isEmailAllowedToSignIn` hook. Blocks
  account *creation* until an admin has added the email to the allowlist.
  This feature turns this **off by default**.
- **Email verification** = better-auth's `emailAndPassword.requireEmailVerification`
  (or equivalent) — blocks *login* until the user clicks a link sent to their
  inbox. This feature also turns this **off by default**, per the literal
  request ("no manual approval **or verification** step"), but this is
  flagged as a distinct, separately-reversible decision (Section 7).
  **(Amendment 1 update:** the *sending* of the verification email is now
  unconditionally in scope (AC-14) regardless of this toggle; only whether
  it additionally *blocks* sign-in remains the open, either-resolution
  decision — see Open Question 6 and AC-15.)

## 5. Acceptance Criteria

### 5.1 OAuth sign-up — gate removed by default

**AC-1**
Given a visitor with a Google or GitHub account whose email is in neither
the `allowed_emails` table nor `AUTHORIZED_EMAILS`,
When they complete the Google or GitHub OAuth consent flow from the sign-in
page,
Then a new `user` row is created, they are signed in, and they are
redirected to `/` — the request is **not** rejected with "Email is not
authorized for this private app." or any equivalent error.

### 5.2 Email+password sign-up — new capability

**AC-2**
Given a visitor is on the sign-in/sign-up surface,
When they submit a syntactically valid, previously-unused email address and
a password meeting the policy in AC-3,
Then a new `user` row is created with credentials stored via better-auth's
`emailAndPassword` provider, and the visitor is signed in and redirected to
`/` — with **no** "check your inbox to verify" interstitial and **no**
pending-admin-approval state.

**AC-3 (password policy — minimum, architect to finalize exact rule)**
Given a visitor submitting the sign-up form,
When the password is empty or shorter than 8 characters (better-auth's
default floor), or the email fails basic format validation,
Then the submission is rejected client-side and server-side with a
descriptive error, and no `user` row is created.

**AC-4 (duplicate email)**
Given an email address that already has an account (via any provider —
OAuth or password),
When a visitor attempts to sign up with that same email via email+password,
Then the sign-up is rejected with a clear "account already exists" style
error (exact wording/behavior — e.g. whether to reveal existence at all vs.
generic messaging — is an architect/`nextjs-security` decision to avoid
account-enumeration leakage; either resolution is acceptable as long as no
duplicate/orphaned `user` row is created).

### 5.3 Email+password sign-in

**AC-5**
Given an existing email+password account,
When the correct email and password are submitted at sign-in,
Then the visitor is signed in and redirected to `/`.

**AC-6**
Given an existing email+password account,
When an incorrect password is submitted,
Then sign-in is rejected with a generic invalid-credentials error (not
revealing whether the email exists), and no session is created.

### 5.4 Default mode is fully open; the gate is preserved as an opt-in, not deleted

**AC-7**
Given the app is deployed with no explicit "restricted mode" configuration
set (the new default),
When any visitor — regardless of email address, domain, or prior allowlist
membership — completes sign-up via OAuth or email+password,
Then account creation succeeds unconditionally; no admin action is required
before or after sign-up.

**AC-8**
Given an operator explicitly opts back into the pre-existing gate (exact
config surface is an architect decision — see Open Question 1),
When a visitor whose email is not on the allowlist attempts to sign up via
any provider,
Then sign-up is rejected with today's existing "not authorized" behavior —
i.e., the allowlist table, the `isEmailAllowedToSignIn` check, and the admin
Members UI must all continue to exist and function for this opt-in path;
none of them are deleted by this feature.

### 5.5 Configuration

**AC-9**
Given a deployment does not set `AUTHORIZED_EMAILS`,
When the app boots (Zod parse in `src/lib/env.ts`),
Then boot succeeds — `AUTHORIZED_EMAILS` becomes `z.string().optional()` (or
equivalent), not a hard-required field. (Today this configuration would fail
`env.parse` with a validation error.)

**AC-10 (backward compatibility)**
Given an existing deployment that still sets `AUTHORIZED_EMAILS` (e.g. as a
bootstrap admin allowlist under opt-in restricted mode, or simply left over
from before this change),
When the app boots and existing OAuth users sign in,
Then behavior is unchanged for that deployment — no breaking change, no
forced migration.

### 5.6 UI copy

**AC-11**
Given the sign-in page today states the app is "invite-only"
(`src/app/sign-in/page.tsx`),
When this feature ships,
Then that copy is removed or rewritten so it no longer claims an invitation
is required, and an email+password sign-up entry point (form or link) is
visibly reachable from the same page.

**AC-12**
Given the Settings → Members UI (`members-manager.tsx`) today frames added
emails as required "Invite"s ("No one invited yet... share `/sign-in` with
them," button labeled "Invite"),
When default open-mode ships,
Then this UI's copy is updated so it no longer misrepresents allowlist
membership as a precondition for signing in under the new default (exact
treatment — reword to "trusted members" / hide behind restricted-mode /
repurpose — is Open Question 2 for the architect, but the copy **must not
contradict actual system behavior** post-ship).

### 5.7 Existing users unaffected

**AC-13**
Given a user who signed up before this change shipped (an existing OAuth
account that previously passed the allowlist gate),
When they sign in again after this feature ships,
Then they sign in normally with no re-approval, no forced password set, and
no duplicate account created.

### 5.8 Real email verification + password reset via Resend (Amendment 1)

**AC-14 (verification email sent on email+password sign-up)**
Given a visitor completes email+password sign-up (AC-2) with a new,
previously-unused email address,
When the account is created,
Then a verification email is sent to that address via the provisioned
Resend integration (`mail.ptfolio.net` sending domain), containing a
one-time verification link — this happens unconditionally for every
email+password sign-up (independent of `AUTH_SIGNUP_MODE` — Open Question 1
— which only affects the admin-approval gate, not this).

**AC-15 (does verification block credential sign-in — open, either resolution acceptable)**
Given a user has signed up via email+password and has **not** yet clicked
the verification link from AC-14,
When they attempt to sign in with correct credentials,
Then the system exhibits **one** of two explicitly acceptable, mutually
exclusive behaviors — chosen once and applied consistently, not left
ambiguous per-request:
  (a) **nudge-only** — sign-in succeeds, a session is created, and the UI
      indicates the email is unverified without blocking access; or
  (b) **block-until-verified** — sign-in is rejected with a "please verify
      your email before signing in" message and no session is created.
Either resolution satisfies this AC (this is Open Question 6 for the
architect — see Section 6 — analogous to how AC-4 already permits either
resolution for account-enumeration). Whichever is chosen must match
better-auth's actual `requireEmailVerification` behavior as verified from
the installed package source (not asserted from memory), and the sign-in
UI's copy must accurately reflect the chosen behavior.

**AC-16 (OAuth sign-ups unaffected)**
Given a visitor signs up via Google or GitHub OAuth,
When the account is created,
Then no verification email is sent, and `user.emailVerified` is set to
`true` immediately — OAuth providers already assert email ownership, so
this AC codifies that AC-1/AC-7's existing OAuth flow is unaffected by this
amendment.

**AC-17 (forgot-password request)**
Given a visitor with an existing email+password account has forgotten their
password,
When they submit their email address on a "Forgot password" form,
Then a password-reset email is sent to that address via Resend containing a
one-time reset link, and the response shown to the visitor is identical
regardless of whether that email has an account (no account-enumeration via
this endpoint) — mirroring the anti-enumeration posture already established
for sign-in (AC-6).

**AC-18 (forgot-password completion)**
Given a visitor holds a valid, unexpired, unused password-reset link (from
AC-17),
When they open the link and submit a new password meeting the policy in
AC-3,
Then their password is updated, the old password no longer authenticates
them, and the visitor is informed the reset succeeded.

**AC-19 (session revocation on reset — open question, verify don't assume)**
Given a user's password is reset via AC-18,
When the reset completes,
Then any other active sessions for that user are handled per better-auth's
actual, verified default behavior for password reset — this is Open
Question 7 for the architect: confirm from better-auth's source whether
other sessions are automatically revoked, and if not, decide whether this
feature must add explicit revocation. Either resolution (auto-revoke
already happens / explicit revocation added / explicitly deferred as a
tracked gap) satisfies this AC, provided the actual behavior is verified
against source and documented — not asserted from memory.

**AC-20 (expired / already-used links)**
Given a verification link (AC-14) or password-reset link (AC-17) has
expired or has already been used once,
When a visitor attempts to use it again,
Then the action is rejected with a clear "link expired or already used —
request a new one" style error, and no side effect occurs (no verification
flip, no password change). Exact TTL and one-time-use enforcement mechanics
are Open Question 8 for the architect to confirm from better-auth's actual
defaults for both the `emailVerification` and
`emailAndPassword` reset-token handling — not asserted here as a specific
number of hours/days.

### 5.9 Custom domain migration: `ptfolio.net` (Amendment 1)

**AC-21 (app reachable at the new domain)**
Given the feature ships,
When a visitor navigates to the new domain under `ptfolio.net` (exact
apex-vs-subdomain choice is Open Question 9 — see Section 6),
Then the app loads and functions identically to the current `*.vercel.app`
deployment — same routes, same auth flows (AC-1 through AC-20 all continue
to hold). This is a config/DNS-level connection to the existing Vercel
deployment, not new application code, so no functional regression is an
acceptable side effect of this migration.

**AC-22 (config change only, not code change)**
Given the domain change is made,
When `BETTER_AUTH_URL` (and by extension `trustedOrigins`, both derived in
`src/lib/auth/setup.ts`'s `getBaseUrl()`/`getTrustedOrigins()`) is updated
to the new domain,
Then this is achieved purely via environment-variable configuration in
Vercel (Production, and Preview if previews should also use it) — no code
change to `getBaseUrl()`/`getTrustedOrigins()`'s existing derivation/fallback
logic is required by this migration (that logic already throws explicitly
if `BETTER_AUTH_URL` is unset on Vercel; the only required action is
setting its value to the new domain).

**AC-23 (DNS records at Squarespace)**
Given `ptfolio.net` is registered with Squarespace (the same registrar
already used for the `mail.ptfolio.net` Resend sending-domain
verification, which is an unaffected, separate subdomain),
When the custom domain is connected to the Vercel project,
Then the DNS records Vercel's domain-connection flow requires (exact record
types/values are Vercel's own requirement, to be read from Vercel's UI at
setup time, not guessed here) are added to the `ptfolio.net` zone at
Squarespace — analogous to the manual Resend DNS verification already
completed — and the app becomes reachable at the new domain once DNS
propagates and Vercel reports the domain as verified.

**AC-24 (old `*.vercel.app` URL behavior — open question, and its interaction with in-flight tokens)**
Given the app is now reachable at the new `ptfolio.net`-based domain,
When a visitor or an existing bookmark/link still points at the old
`*.vercel.app` deployment URL,
Then the old URL exhibits **one** of three explicitly possible, not-assumed
behaviors — this is Open Question 10:
  (a) continues to work in parallel indefinitely;
  (b) redirects to the new domain; or
  (c) is disabled/blocked.
Whichever is chosen, the cutover plan must explicitly account for
verification/reset links (AC-14/AC-17) issued *before* the domain switch
that reference the old URL and are still within their validity window
(AC-20) — such links must not silently break as an unplanned side effect of
this migration.

### 5.10 Data-processes and data-lifecycle documentation (Amendment 1)

**AC-25 (end-to-end process inventory exists)**
Given this feature (open self-service sign-up, AC-1…AC-13, plus real email
verification/reset and custom domain, AC-14…AC-24) ships,
When `documentation-writer` produces the documentation deliverable required
by this amendment,
Then a doc exists under `docs/` (a new file, added to `docs/INDEX.md` per
`documentation-standards`) that describes, as a numbered flow (trigger →
steps → resulting data state) — not merely a bullet list of feature names —
every process this feature introduces end-to-end: OAuth sign-up (Google and
GitHub), email+password sign-up, email verification, sign-in (both kinds),
forgot-password request + reset, and the admin allowlist toggle (existing
mechanism, cross-referenced rather than re-described).

**AC-26 (data inventory: every table/column populated)**
Given the same documentation deliverable,
Then it enumerates every table/column populated as a result of these
processes, cross-referencing `src/lib/db/schema.ts`'s `user` table
(including `emailVerified`), the `account` table (including the `password`
column, populated only by the email+password path), the `session` table,
and the `allowedEmails` table, plus better-auth's internal
verification/reset-token table — whose exact name and columns must be
confirmed by the architect from the installed `better-auth` package's own
schema/migration output, not guessed here — stating for each what triggers
row creation, update, and deletion.

**AC-27 (Resend documented as a third-party subprocessor)**
Given Resend (built on Amazon SES) is now the first third-party service in
this codebase's auth path to receive user personal data,
Then the documentation deliverable explicitly names Resend as a
subprocessor; states what data it receives (recipient email address; email
body content, which includes verification/reset links containing tokens);
states the processing region (`eu-west-1`, per the provisioned
`mail.ptfolio.net` domain); and flags this new data flow for
`gdpr-compliance` skill review as requiring subprocessor disclosure. This AC
requires the fact to be **documented** — it does not require a completed
DPA or full legal review as part of this feature.

**AC-28 (data erasure / lifecycle — verify, don't assume, what's automatic)**
Given the documentation deliverable must describe data erasure per the
user's explicit request,
Then it documents, for each of: (a) account deletion (if no such flow exists
today, that absence must be flagged as a gap, not silently assumed away),
(b) verification/reset token expiry, and (c) abandoned sign-ups (account
created but never verified) — what is deleted automatically by better-auth
today versus what requires explicit cleanup (e.g. a cron job). This is Open
Question 11 for the architect: `src/lib/auth/cron.ts` as of this AC's
authoring contains only a constant-time `CRON_SECRET` bearer-token check
used by the `quotes`/`fx`/`coinbase` sync cron routes — **no** auth-data
cleanup exists there today — the architect must confirm this directly from
source (already done here) and from better-auth's actual token-cleanup
defaults before asserting whether a new cleanup cron is required.

**AC-29 (privacy-policy gap carried forward, not required to be closed)**
Given the existing design doc's §7.3 already notes no privacy-policy /
Datenschutzerklärung page exists anywhere in this codebase,
Then the documentation deliverable explicitly restates this gap as still
open and unresolved by this amendment. This AC requires the gap to be
accurately documented — it does not require a privacy-policy page to be
written as part of this feature.

## 6. Open questions for the architect (decisions needed, not assumed here)

1. **Allowlist/admin-approval-gate disposition.** The literal request is
   "no manual approval," but the task brief explicitly says not to assume
   the mechanism should be deleted. AC-7/AC-8 require the gate to become
   **opt-in rather than deleted** — recommended design: a single config
   flag (e.g. an `AUTH_MODE` / `RESTRICTED_SIGNUP` env var, or simply "gate
   is active iff `AUTHORIZED_EMAILS` and/or a new explicit flag is set")
   that the architect should pick concretely. This preserves the
   `allowed_emails` table, the hook, and the admin Members UI for anyone who
   wants to run a private instance later.
2. **Members UI treatment under open mode** (AC-12) — reword vs. conditionally
   hide vs. repurpose as an optional blocklist. Needs an explicit design
   decision; flagged rather than assumed.
3. **Password policy specifics** — AC-3 gives a testable floor (8 chars,
   matching better-auth's default) but does not mandate complexity rules;
   architect should confirm the exact `emailAndPassword` config
   (`minPasswordLength`, `requireEmailVerification`, session
   behavior) against better-auth's actual API surface.
4. ~~**Password reset flow** — explicitly out of scope per Section 3~~
   **RESOLVED by Amendment 1 — now in scope, see AC-17…AC-20.** Original
   text kept for history: "flagged: there is no outbound-email provider in
   this codebase today... If password reset is required before public
   launch, that's a new integration (e.g. Resend) with its own env
   vars/secrets and should be scoped as a follow-up feature, not silently
   bundled into this one." That follow-up is this amendment.
5. **Account-enumeration behavior on duplicate sign-up (AC-4)** — decide
   whether to reveal "email already registered" or use a generic message;
   either satisfies the AC, but `nextjs-security`/`code-reviewer` should
   weigh in given this is a public-facing form.
6. **(Amendment 1, new — architect decision, either resolution acceptable)**
   **Does unverified email block credential sign-in (AC-15)?** Nudge-only
   vs. block-until-verified are both defensible; recommend picking whichever
   better-auth's actual `requireEmailVerification` default most cleanly
   supports (verify from source), and documenting the choice — not asserting
   a specific behavior from memory.
7. **(Amendment 1, new — architect must verify from source, not decide
   arbitrarily)** **Are other active sessions revoked on password reset
   (AC-19)?** better-auth may already have default behavior here — the
   architect must check the installed package source before asserting
   either way, and add explicit revocation only if the default doesn't
   already cover it.
8. **(Amendment 1, new — architect must verify from source)** **Exact TTL
   and one-time-use mechanics for verification and reset tokens (AC-20)** —
   do not assert a specific number of hours/days here; confirm from
   better-auth's actual defaults.
9. **(Amendment 1, new — needs the user's direct confirmation, not just the
   architect's)** **Apex domain (`ptfolio.net`) vs. subdomain (e.g.
   `app.ptfolio.net`) for the app (AC-21)?** Tradeoff: apex is simpler for a
   single-app product with no separate marketing site today; a subdomain
   avoids future conflicts if a marketing/landing page is ever added at the
   apex. **Recommendation: apex, as the default, given this app's current
   shape (single app, no separate site)** — but this must be confirmed by
   the user before implementation, consistent with how the existing design
   doc's §10 already flags analogous user-facing decisions as needing
   sign-off beyond the architect level.
10. **(Amendment 1, new — needs user/architect confirmation)** **What
    happens to the old `*.vercel.app` URL post-migration (AC-24)?** Keep
    working in parallel / redirect / disable — not assumed here. Whichever
    is chosen must account for in-flight verification/reset links (AC-20).
11. **(Amendment 1, new — architect must verify from source before
    deciding)** **What data-erasure cleanup is needed for expired tokens /
    abandoned (never-verified) sign-ups (AC-28)?** `src/lib/auth/cron.ts`
    today has no auth-data cleanup logic (confirmed by reading it — see
    "Amendment 1" grounding notes above); the architect must additionally
    check what better-auth auto-expires/auto-purges before deciding whether
    a new cron job is needed.

## 7. Risks flagged for follow-up (explicitly not blocking this AC, but must be tracked)

- **No CAPTCHA/rate limiting exists anywhere in this codebase.** Opening
  self-service sign-up to the public materially increases exposure to
  automated account creation, credential stuffing on the new password
  sign-in, and spam. Recommend a `nextjs-security`-reviewed follow-up (rate
  limiting on `/api/auth/**` sign-up/sign-in, and/or better-auth's built-in
  rate-limit config) even though it is not required for this AC to be
  satisfied. **(Amendment 1: unaffected — still open, and now also covers
  the new `/forgot-password`/reset endpoints from §5.8.)**
- **Skipping email verification** (per the literal request, Section 4) means
  typo'd or unowned email addresses can create accounts, and there is no
  proof-of-ownership before the account starts touching financial/PII data
  (broker statements, tax reports). Recommend keeping
  `requireEmailVerification` as a single, well-isolated config toggle so it
  can be flipped on later without a redesign, and flag this explicitly to
  `gdpr-compliance` review given the increase in scale from 5 known/invited
  users to an open public signup surface. **(Amendment 1: this risk is now
  being directly addressed — verification emails are sent (AC-14); whether
  they also block sign-in remains Open Question 6. The proof-of-ownership
  gap is closed either fully (block) or partially (nudge) depending on that
  choice — not fully eliminated regardless of resolution until that
  decision is made.)**
- **GDPR/BDSG posture change.** Moving from "5 people I personally invited"
  to "anyone on the internet" changes the lawful-basis and scale
  assumptions for this financial-data app. Recommend a `gdpr-compliance`
  skill pass (consent/privacy-policy copy on the sign-up form, data
  minimization, breach-notification posture) alongside or shortly after this
  feature ships — not blocking these AC, but should not be silently dropped.
  **(Amendment 1: sharper now — Resend is a new named subprocessor
  (AC-27), and the data-lifecycle doc (§5.10) is explicitly required in
  part to support this eventual `gdpr-compliance` pass, though that pass
  itself remains a follow-up, not part of this AC.)**

## 8. Traceability

Each AC above is numbered (AC-1 … AC-29, with AC-14…AC-29 added by
Amendment 1) so `tester` can map tests 1:1 back to this doc, and
`code-reviewer` can confirm the diff satisfies a specific AC rather than
"the general idea of open signup."

## 9. Documentation follow-up

Once implemented, `documentation-writer` should:
- Add a new **Business Logic** entry to `docs/INDEX.md` for this doc (or its
  successor architecture spec) — auth/sign-up has no existing entry today.
- Update the `allowedEmails` schema doc-comment in `src/lib/db/schema.ts`
  ("Only emails in this table ... can complete the OAuth sign-up flow") once
  the gate's disposition (Open Question 1) is decided, since that comment
  will otherwise become inaccurate.
- Record the change in `docs/CHANGELOG.md` once shipped (what/why/when +
  link to the architecture spec this AC feeds).
- **(Amendment 1, new)** Produce the AC-25…AC-29 data-processes /
  data-lifecycle inventory as **its own doc**, distinct from this AC doc —
  per `documentation-standards`'s "one concept per file" rule, sign-up
  *behavior* (this doc) and a *data-governance/GDPR inventory* are different
  concepts and should not be merged. Add it to `docs/INDEX.md` under
  Business Logic (or a new GDPR/data-governance section if one doesn't yet
  exist) and cross-link it from this doc.
- **(Amendment 1, new)** Record the custom-domain migration (AC-21…AC-24) in
  `docs/CHANGELOG.md` separately from the sign-up feature entry, since it is
  an infrastructure/config change with its own date and its own rationale
  (moving off `*.vercel.app`), not strictly part of the sign-up business
  logic — consistent with `documentation-standards`'s one-concept-per-entry
  discipline.
- **(Amendment 1, new)** Once Open Question 9 (apex vs. subdomain) is
  resolved by the user, record the chosen domain in whichever doc records
  deployment configuration (create one under Architecture in
  `docs/INDEX.md` if none exists yet — there is currently no doc describing
  Vercel domain/DNS configuration in this codebase).
