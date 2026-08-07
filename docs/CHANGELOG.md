# Changelog

Reverse-chronological record of shipped behavior/architecture changes. Each
entry captures **what** changed, **why**, **when**, and a link to the
driving spec/plan (see the `documentation-standards` skill's changelog
rules). This file is history, not the source of truth for current
behavior — for that, follow the links into `docs/INDEX.md`.

## 2026-08-06 — Email verification is now mandatory and blocking (supersedes 2026-08-05's nudge-only decision)

**What:** Sign-in on an unverified email+password account now hard-blocks
instead of nudging. This reverses the 2026-08-05 entry's explicit
`requireEmailVerification: false` ("nudge-only... does not block sign-in")
decision.

- **`src/lib/auth/setup.ts`:** `emailAndPassword.requireEmailVerification`
  flipped `false` → `true`; `emailVerification.autoSignInAfterVerification:
  true` added. Sign-up no longer auto-signs-in or redirects to `/` — the
  visitor lands in a "check your email" waiting state instead. Sign-in with
  an unverified account now rejects (`EMAIL_NOT_VERIFIED`/`FORBIDDEN`)
  instead of succeeding with a dismissible banner; `src/lib/auth/server.ts`'s
  `getCurrentUser()` also now checks `emailVerified`, closing the
  grandfathered-session gap for sessions created before this change.
  `src/components/auth/auth-card.tsx`'s old `unverifiedNudge` state/branch is
  removed and replaced by one shared wait-state UI, reused for both the
  post-signup wait and the blocked-sign-in resend case.
- **Live cross-tab/cross-device transition:** a visitor who opens the
  verification link in a second tab or an entirely different device/browser
  no longer needs to manually refresh or re-sign-in. Same-browser tabs sync
  via a dedicated `BroadcastChannel("folio-auth")` signal, correlated by a
  per-attempt id so only the tab actually waiting on the verified email
  transitions (not some other concurrent attempt in the same browser).
  Cross-device grant is a new, rate-limited `POST /signup-attempt/claim`
  polling endpoint (`src/lib/auth/signup-attempt-plugin.ts`), correlated by
  an opaque, server-generated attempt id — never by email — so it cannot be
  used to probe whether an address has an account (anti-enumeration; see
  design doc §2.1's security invariant). No persistent WebSocket/push
  infrastructure was introduced.
- **New `src/app/verify-email/page.tsx` route:** the landing page for the
  emailed link; on success it broadcasts the same-browser signal and
  redirects into the app (the session cookie is already set by
  better-auth's own `autoSignInAfterVerification`); on an expired, invalid,
  already-used-for-a-deleted-account, or malformed token it shows one
  generic "link expired or invalid" state — deliberately not distinguishing
  the reasons, so it can't be used to reveal whether an account exists.
- **Anti-enumeration on duplicate sign-up:** signing up with an email that
  already has an account now returns the same generic "check your email"
  waiting state as a genuine new sign-up (better-auth's
  `shouldReturnGenericDuplicateResponse`, enabled as a side effect of the
  `requireEmailVerification` flip — no bespoke code) instead of the previous
  `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` response that revealed the
  account's existence.
- **New `signupAttempts` table** (`src/lib/db/schema.ts`): correlates a
  fresh sign-up to its cross-device claim; stores only an opaque attempt id,
  a `user` FK, and expiry/consumption timestamps — no additional PII. A
  transient, `returned: false` passthrough column on `user`
  (`signup_attempt_id`) is nulled again within the same request once the row
  is written. Both are excluded from the abandoned-account cascade
  safeguard's owner-data list — they're auth mechanism, not user-owned data
  — but `signupAttempts` rows do cascade-delete with their `user` row like
  `session`/`account`.
- **`auth-cleanup` cron gains a third sweep** (`src/lib/auth/auth-cleanup.ts`,
  same daily trigger, no new cron job): deletes expired or already-consumed
  `signupAttempts` rows, unconditionally (not gated behind
  `AUTH_CLEANUP_DELETE_ENABLED`), same reasoning as the existing expired-
  `verification`-row sweep.

**Why:** The 2026-08-05 nudge-only decision left a proof-of-ownership gap
that doc's own risk log flagged explicitly: an unverified email could still
touch the app's financial/tax data. This change closes that gap while
keeping the sign-up experience live (no dead-end "go check your email and
come back manually" step) across tabs and devices.

**Verification:** DB-gated security-invariant tests confirm a duplicate
sign-up creates zero `signupAttempts` rows (only a genuine `createUser` can
bind one), and the cleanup-sweep tests were run against real Postgres, not
mocked. See the AC doc's build-sequence (§9) for the full TDD step list.

See [AC doc](superpowers/specs/2026-08-06-email-verification-gate-ac.md),
[design spec](superpowers/specs/2026-08-06-email-verification-gate-design.md).
This entry **supersedes** the "nudge-only... does not block sign-in"
statement in the 2026-08-05 entry below — treat that clause as historical
record of a decision since reversed, not current behavior.

## 2026-08-05 — Open self-service sign-up, email verification, password reset & `auth-cleanup` cron

**What:** Sign-up is no longer invite-only. On top of the pre-existing
Google/GitHub OAuth path:

- **Email + password sign-up/sign-in** via a new `AuthCard` component
  (`src/components/auth/`), wired into `src/app/sign-in/page.tsx`.
- **`AUTH_SIGNUP_MODE`** (`src/lib/auth/signup-mode.ts`) makes the
  pre-existing admin-approval allowlist gate opt-in: `"restricted"`
  restores the old invite-only behavior, `"open"` (the default) lets
  anyone sign up. The Members section (`src/app/(app)/settings/page.tsx`,
  `src/components/pulse/members-manager.tsx`) copy now branches on
  `signupMode` instead of unconditionally implying the allowlist is a
  sign-in precondition.
- **Resend-backed transactional email** (`src/lib/email/`,
  `src/lib/auth/auth-emails.ts`): email verification is sent
  unconditionally on sign-up but is nudge-only (`requireEmailVerification:
  false` — does not block sign-in); password reset
  (`src/app/reset-password/page.tsx`) revokes all other sessions on
  successful reset.
- **Rate limiting:** better-auth's built-in `rateLimit` turned on
  (`rateLimit: { enabled: true }` in `src/lib/auth/setup.ts`).
- **`/privacy` page** (`src/app/privacy/page.tsx`, new): first real privacy
  policy content, linked from sign-in, closing the previously-flagged
  gap — see open items below for its known limitations.
- **`auth-cleanup` cron** (`src/app/api/cron/auth-cleanup/route.ts` +
  `src/lib/auth/auth-cleanup.ts`, triggered daily at 03:17 UTC by
  `.github/workflows/auth-cleanup.yml`, mirroring the existing
  `quotes-refresh.yml` pattern): unconditionally purges expired
  `verification` rows (email-verification/password-reset tokens), and —
  behind `AUTH_CLEANUP_DELETE_ENABLED` (`src/lib/env.ts`, default
  `"false"`/dry-run, log-only) — deletes never-verified accounts abandoned
  6+ months, gated by a mandatory owned-data safeguard requiring zero rows
  across all 13 owner-scoped tables before a candidate is deleted.

**Why:** Removes the admin-invitation bottleneck for new users while
keeping a restricted mode available, adds the account-recovery and
anti-abuse mechanics (verification, reset, rate limiting) a public
sign-up surface needs, and gives the now-larger, partly-unverified user
base a bounded-retention cleanup path for abandoned accounts instead of
indefinite accumulation — see the AC doc's GDPR data-minimization framing.

**Verification:** New unit/integration coverage added under `tests/auth/`
(`signup-mode.test.ts`, `auth-emails.test.ts`, `copy.test.ts`,
`setup.smoke.test.ts`), `tests/lib/email/resend.test.ts`,
`tests/lib/env.test.ts`, `tests/components/auth/auth-card.test.ts`, and
`tests/api/cron/auth-cleanup.test.ts` /
`tests/api/cron/auth-cleanup-predicate.test.ts` (the latter covering the
13-table owned-data safeguard directly). Pre-existing `tests/auth/`
suites (`allowlist.test.ts`, `admin.test.ts`, `provider-visibility.test.ts`,
`cron.test.ts`) continue to pass unmodified.

**Known open items (not resolved by this change):**
- `/privacy`'s controller name and postal address are still placeholders
  (`src/app/privacy/page.tsx`), and its statement about Resend's
  processing region/DPA is unverified — both explicitly marked
  "Placeholder" in the page copy pending legal review.
- No self-service account-deletion UI exists yet; erasure is still
  contact-based only (the `auth-cleanup` cron's abandoned-account sweep
  covers a narrow, never-verified/zero-data case, not user-initiated
  deletion).
- No e2e coverage for the new sign-in/reset-password pages: this repo has
  no jsdom/`@testing-library/react` setup (`vitest.config.ts` runs
  `environment: "node"`) and no Playwright specs for these routes yet;
  `tests/auth/copy.test.ts` asserts UI copy against source text as a
  narrower, deliberate substitute — see that file's own recommendation to
  add real component/e2e tooling.
- The `ptfolio.net` custom-domain migration (design doc §17) is a
  separate, pending DNS-propagation step taken by the user outside this
  codebase — `BETTER_AUTH_URL` and `BETTER_AUTH_LEGACY_ORIGIN` are not yet
  cut over in env config, and `.github/workflows/quotes-refresh.yml`'s
  `VERCEL_PRODUCTION_URL` still needs updating once it is.

**Docs:**
[AC doc](superpowers/specs/2026-08-05-open-signup-ac.md),
[design spec](superpowers/specs/2026-08-05-open-signup-design.md),
[data-lifecycle inventory](superpowers/specs/2026-08-05-open-signup-data-lifecycle.md).

## 2026-07-21 — Positions & Tax redesign shipped (presentational only)

**What:** The Positions page and Tax area were restyled to the approved
Claude Design mockups, plus a global chrome polish:

- **Chrome:** sticky/blurred top header, mockup spacing; existing `Crypto`
  nav item and mobile `BottomNav` kept.
- **Positions:** new `PositionsHero` (portfolio value + all-time return +
  sector donut, derived client-side from already-loaded data); new
  URL-persisted `PositionsSort` (Value / Gain / A–Z) backed by pure,
  unit-tested helpers in `src/lib/analytics/positions-view.ts`; restyled
  section rows, cash card, and detail slide-over (470px) — all existing
  app extras kept (quote chips, Dist/Acc badges, FIFO-lot breakdown,
  `InstrumentSourceCard`, `PnlModeToggle`).
- **Tax:** hub restyled to a 4-card nav grid; ELSTER values and the
  pre-submit checklist moved off the hub onto a new deep-linkable route,
  **`/tax/[year]/elster`**; realized trades now open in a
  `RealizedTradesModal`; a "Why two pots?" modal explains the
  Aktien/Sonstige split; Loss Harvest and Anlage SO sub-views were
  restyled with their server-side tax computation left untouched.

**Why:** Bring the UI in line with the approved Claude Design mockups
(project `338f8445-88d0-4060-b093-7dda84c93410`) while reusing every
existing data loader, API contract, and route — the design spec's
non-negotiable guardrail is that no tax logic, rate, or loss-bucket rule
changes.

**Verification:** `git diff 56fc841..HEAD -- src/lib/tax src/lib/data
src/lib/api/contracts.ts` is empty, and the full tax golden-fixture suite
(`tests/tax/**`) stayed green throughout — this is the mandatory
mechanical proof of the presentational-only boundary (plan Task 16).
New unit tests cover the positions-view helpers; Playwright specs
`e2e/positions-redesign.spec.ts` and `e2e/tax-redesign.spec.ts` cover the
interactive flows and mobile layout.

**Caught during review, not shipped:** the Loss Harvest restyle briefly
introduced a display-only `carriedForwardEur` figure derived from
`HarvestResult` fields. It did not correctly separate the Aktien/Sonstige
buckets that §20 Abs. 6 S. 4 EStG requires, so it was removed before
merge — `src/lib/tax/loss-harvest.ts` itself was never touched, so there
is no behavioral residue. A real, bucket-separated Verlustvortrag display
remains a **deferred tax feature**: it must go through the `tax-advisor`
agent with golden-fixture verification before it ships (tracked by the
Verlustvortrag planner spec, not by this redesign).

**Docs:**
[design spec](superpowers/specs/2026-07-21-positions-tax-redesign-design.md),
[implementation plan](superpowers/plans/2026-07-21-positions-tax-redesign.md),
[Verlustvortrag planner spec](superpowers/specs/2026-07-19-carryforward-planner.md)
(deferred follow-up).
