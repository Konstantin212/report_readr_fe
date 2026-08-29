# Changelog

Reverse-chronological record of shipped behavior/architecture changes. Each
entry captures **what** changed, **why**, **when**, and a link to the
driving spec/plan (see the `documentation-standards` skill's changelog
rules). This file is history, not the source of truth for current
behavior — for that, follow the links into `docs/INDEX.md`.

## 2026-08-28 — First-Run Onboarding Clarity (single-sourced instruction copy, `/upload` disclosure, first-run dashboard)

**What:** Four fixes to what a cold, unknown user meets before they have any
data — sign-up has been open since 2026-08-05, but the onboarding surfaces
still read like they were written for a handful of known users:

- **One authoring site for all broker instruction prose**
  (`src/lib/onboarding/broker-instructions.ts`, new). Plain TypeScript — copy
  as typed `CopySpan[]` runs, no JSX, no `"use client"`, no Tailwind class
  names. Three surfaces now render it through
  `src/components/onboarding/instruction-copy.tsx` (`Spans` /
  `InstructionBody`, chrome-free): the welcome tour, the new `/upload`
  disclosure, and the Settings → Crypto empty state. Chrome stays with each
  consumer, so wording is shared while layout is not. **This is the durable
  rule the feature exists to establish: onboarding prose is edited in that
  module, never in a component.**
- **An always-reachable "How do I export a statement?" disclosure on
  `/upload`** (`src/components/pulse/export-instructions.tsx`, new),
  collapsed by default, native `<button>` + `aria-expanded`/`aria-controls`.
  Mounted as a **sibling** of the dropzone's `<label>`, never inside it — any
  click inside that label activates the hidden file input, so the trigger is
  placed outside rather than defended with `stopPropagation`. Its open state
  lives in the leaf, so toggling cannot re-render an in-flight upload queue.
  It reads no `localStorage`, so it is reachable after the one-shot welcome
  tour has been permanently dismissed.
- **Coinbase connect instructions corrected to match the real form.** The
  tour said "Copy the key + secret" / "Paste them", implying two fields; the
  form is a single `CDP Key JSON` textarea that wants the whole downloaded
  key file. The copy now names the `.json` file Coinbase downloads, says to
  open it in a text editor and paste its entire contents into that one box —
  and that sentence is a single function, `coinbasePasteInstruction(where)`,
  shared by the tour and the Settings → Crypto empty state. The tour's
  Coinbase finish path now deep-links to `/settings?section=crypto`; bare
  `/settings` defaults to `section=brokers` and shows "No broker accounts
  yet", the opposite of that user's task. Every other in-app pointer at the
  connect form (`ReadyCard`, `crypto/page.tsx`, `crypto-card.tsx`,
  `first-run-card.tsx`) uses the same deep link.
- **First-run dashboard card** (`src/components/onboarding/first-run-card.tsx`,
  new; predicate in `src/lib/onboarding/first-run.ts`). A user with zero
  imports **and** no connected crypto account gets one explanatory card with
  an "Upload a statement" CTA instead of a €0.00 hero and seven more zeroed
  widgets. Both conditions are required: a Coinbase-only user has zero
  imports but real positions and still gets the normal dashboard. Implemented
  as an early return in `src/app/(app)/page.tsx`, so the returning-user path
  is a literal no-diff. The card is a server component reading no browser
  storage, so it sits underneath the auto-opened tour and survives every
  dismiss path; it points at the topbar `?` as the way back to the
  walkthrough.
- **Two misleading strings removed.** `No chart yet — history backfilling.`
  claimed a background job that does not exist (now `No performance history
  yet.`), and `This is a small, friends-only portfolio + German tax tool.`
  contradicted `AUTH_SIGNUP_MODE` defaulting to `"open"` (now `This is a
  portfolio + German tax tool.` — the two disallowed words deleted, nothing
  else).

**Why:** The instructions did not match the screens. The Coinbase step
described a form that does not exist, the export steps were only ever
reachable inside a one-shot tour that any close path dismisses permanently,
the dashboard showed a brand-new account a wall of zeros with no call to
action, and the first sentence a public visitor read told them the tool was
friends-only. The root cause of the Coinbase defect was duplicated prose in
two components, which is why the fix is a single copy module rather than a
wording patch.

**Notable non-changes:** no new dependency, no DB migration, no new query
(`getImportCount` in `src/lib/data/imports.ts` is wrapped in React `cache()`
so the layout's call and the dashboard's collapse to one `count(*)` per
request — the App Router's supported substitute for prop-drilling from a
layout, which cannot inject props into `children`). No analytics change: the
tour still emits the literal `"settings"` for the Coinbase path even though
its destination URL gained a query string, because `tourNextAction()` and
`tourDestination()` (`src/lib/onboarding/tour-next-action.ts`, new) are
deliberately separate functions — after this change it is not possible to
widen the analytics allow-list by editing a URL. Nothing under `src/lib/tax`,
the ledger, or Anlage KAP/KAP-INV/SO was touched, and no Revolut copy was
added, removed or reworded.

**Behavioural consequence, decided rather than stumbled into:** an existing
user who deletes all imports and disconnects Coinbase now sees the first-run
card instead of the zeroed dashboard.

**Verification:** `tests/onboarding/broker-instructions.test.ts`,
`first-run.test.ts`, `tour-next-action.test.ts` and `copy.test.ts` (the
cross-cutting gate: one authoring site per distinctive sentence, banned
strings absent, disclosure mounted outside the label). Known gap, stated
rather than hidden: Vitest runs `environment: "node"` with no jsdom, so
nothing proves the disclosure renders, that `aria-expanded` flips at runtime,
or that clicking the trigger does not open the file picker. The structural
choices carry that behaviour; the tests pin the choices. Closing it needs
jsdom + Testing Library or a Playwright e2e on `/upload`.

See [AC doc](superpowers/specs/2026-08-28-onboarding-clarity-ac.md),
[design spec](superpowers/specs/2026-08-28-onboarding-clarity-design.md), and
the durable [onboarding surfaces doc](onboarding-surfaces.md) for the
invariants and "where do I edit this" guidance.

## 2026-08-08 — Role System & Admin Panel (DB-backed roles, user management, impersonation, deletion-as-erasure)

**What:** Replaces the ad-hoc "is this route reachable" story for a brand
new admin panel with a durable, per-user role and a full management UI:

- **DB-backed role** (`src/lib/db/schema.ts`): new `role`, `banned`,
  `banReason`, `banExpires` columns on `user`, plus `impersonatedBy` on
  `session`, added via better-auth's own `admin` plugin
  (`src/lib/auth/setup.ts`, `admin({ defaultRole: "user", adminRoles:
  ["admin"], allowImpersonatingAdmins: false, impersonationSessionDuration:
  1800 })`). New sign-ups get `role: "user"` explicitly written in the
  existing `databaseHooks.user.create.before` hook, not left to the
  plugin's own default-role behavior, so default-deny holds regardless of
  better-auth's internal hook-merge order. `role: NULL` (every pre-existing
  row, until the bootstrap step below runs) reads as non-admin with no
  special-case code.
- **New `/admin` panel** (`src/app/(app)/admin/**`,
  `src/app/api/admin/panel/**`), gated by a single choke point,
  `requireAdminUser()`/`requireAdminApi()` (`src/lib/auth/require-admin.ts`)
  — called first-line in every admin page and every admin API route, not
  just the shared layout (a layout wraps pages, not API routes). An
  automated coverage test (`tests/admin/route-guard-coverage.test.ts`)
  greps both route trees so a future route that forgets the guard fails CI
  instead of shipping unguarded.
  - **User list:** signup date, whether the user has at least one
    successful `imports` row ("did they upload something"), paginated.
  - **User detail / edit:** name, email, role. Editing email flips
    `emailVerified` back to `false`, sends a fresh verification email, and
    revokes the target's other sessions — an admin-set email is treated the
    same as any other untrusted input, never auto-trusted-verified.
  - **Delete:** hard-deletes the `user` row behind a type-the-email
    confirmation step; the pre-existing `onDelete: cascade` FKs on all 13
    owner-scoped tables (plus `session`/`account`) do the rest atomically,
    in one statement (`src/lib/data/admin-mutations.ts`) — no new
    application-level fan-out delete logic.
  - **Impersonate:** uses better-auth's own cookie-swap session mechanism
    (`auth.api.impersonateUser`/`stopImpersonating`) rather than hand-rolled
    session forgery; 30-minute bounded duration, persistent
    non-dismissible banner for the whole duration
    (`src/components/admin/impersonation-banner.tsx`), explicit exit at any
    time.
  - **Last-admin protection** (`src/lib/data/admin-guard.ts`): demoting or
    deleting the sole remaining admin is rejected via a single
    atomic SQL `WHERE`/`EXISTS` predicate (this DB driver,
    `drizzle-orm/neon-http`, has no transaction support, so the guard has
    to be baked into the statement itself, matching the existing
    `auth-cleanup.ts` precedent) — not a separate check-then-act call that
    could race.
- **New `admin_audit_log` table** (`src/lib/data/admin-audit-log.ts`):
  append-only; one row per `ACCOUNT_DELETE`, `ACCOUNT_EDIT`,
  `IMPERSONATION_START`, `IMPERSONATION_END`. Data-minimized by design —
  actor and target identity (id + email snapshot) and a small structured
  diff only, no IP address, no session token, no free-text notes field.
- **Legacy admin gate untouched:** `src/lib/auth/admin.ts`'s
  `isAdminEmail()`/`ADMIN_EMAILS` env-var mechanism is **not** removed or
  replaced — it continues to separately gate the pre-existing
  `/api/admin/allowlist*`, `/api/admin/refresh-quotes`,
  `/api/admin/backfill-fx`, `/api/admin/backfill-history` routes and
  Settings → Members. The new `role` column is a second, independent admin
  concept for the new panel only; the two do not interact. The one place
  they touch is `scripts/bootstrap-admin-roles.ts` (new, one-off), which
  reads `ADMIN_EMAILS` once to backfill `role = 'admin'` for existing
  admins after the migration lands.

**Two product decisions made explicitly on 2026-08-08 (not defaults, not
architect/developer assumptions):**

1. **Impersonation is full session parity with the target user, by
   design.** Not a restricted "view-only" mode — an impersonating admin can
   do anything the target could do in their own ordinary session. The only
   remaining limits are structural, not policy: an impersonated session can
   never reach the admin panel itself (its `role` is the *target's* role),
   which also makes nested impersonation impossible regardless of the
   target's actual role; and account deletion still isn't reachable via
   impersonation, only because no self-service deletion flow exists for
   regular users at all.
2. **Admin-triggered deletion is the app's GDPR Art. 17 erasure mechanism**
   for this app — not a separate or future feature, and not "purely admin
   housekeeping." This corrects the 2026-08-05 entry below, which stated
   erasure was contact-based only; see that entry's superseding note and
   the data-lifecycle doc's new §AC-28.4 for the still-open follow-on gaps
   this designation does **not** close (no confirmation-back-to-user step,
   third-party processor data (Resend, Vercel Analytics) not reached,
   statutory tax-record-retention tension unresolved).

**Why:** The pre-existing `ADMIN_EMAILS` allowlist could only be changed by
a redeploy and had no user-management surface at all (no list, no edit, no
delete, no impersonate) — unworkable once the app has more than a handful
of hand-managed users, and blocking the promote/demote and audit-trail
requirements this feature was actually built for.

**Status: implemented and tested — not yet deployed.** Both remaining steps
are deploy-time, not code, and have **not** been run against any database in
this sandbox:

- `drizzle/0013_amused_roughhouse.sql` (the schema migration) has not been
  applied to any database yet.
- `scripts/bootstrap-admin-roles.ts` (the one-off role-backfill script) has
  not been run against any real database yet.

Until both run, `role` is `NULL` for every existing row (zero admins),
which is safe — the panel isn't reachable by anyone in that window since
there's no admin yet to reach it — but it does mean this feature ships
code-complete, not live.

**Verification:** cleared `code-reviewer` (GO) and QA sign-off (GO). Test
coverage includes `tests/admin/route-guard-coverage.test.ts` (AC-2.5's
"every route independently guarded" requirement), `tests/data/admin-guard.test.ts`
(last-admin atomic predicate), `tests/data/admin-audit-log.test.ts`,
`tests/data/admin-users.test.ts`, `tests/data/admin-mutations.test.ts`,
`tests/auth/admin-nav-context.test.ts`, `tests/api/admin-panel-users-id.test.ts`,
and `tests/api/admin-panel-impersonate.test.ts`, alongside the pre-existing
`tests/auth/admin.test.ts` for the untouched legacy gate.

See [AC doc](superpowers/specs/2026-08-08-admin-panel-ac.md) and
[design spec](superpowers/specs/2026-08-08-admin-panel-design.md). GDPR
data-lifecycle impact folded into
[data-lifecycle doc](superpowers/specs/2026-08-05-open-signup-data-lifecycle.md)
(new §AC-28.4).

## 2026-08-07 — Vercel Web Analytics custom-event tracking

**What:** Added lightweight, privacy-minimizing custom-event usage
analytics via `@vercel/analytics`, covering key user actions across
Upload, Auth, Tax, Positions/Dashboard, Settings, and Nav/Onboarding.

- **`src/lib/analytics-events.ts` (new):** single boundary module — the
  only file in the app that imports `track` from `@vercel/analytics`.
  Exports 24 narrowly-typed `track*` functions (one per event, fixed
  named-property parameters, no index signature/generic
  `track(name, props)` escape hatch), so a call site cannot pass an
  arbitrary or misspelled property key without a TypeScript error. All
  functions funnel through a private `send()` that wraps `track()` in a
  `try`/`catch` — analytics failures (ad-blocker, offline, etc.) are
  swallowed and never break app functionality (AC-G6). Also exports the
  two enum-taxonomy fixes the AC doc called out (statement-upload
  `UploadBroker` vs. the Positions/Dividends broker-filter enum are kept
  separate; `toUploadBroker` mapper returns `null` for `COINBASE`, which
  has no statement-upload path) and two data-minimization helpers
  (`sanitizeSectorForAnalytics` clamps unbounded provider-sourced sector
  labels to a 12-value allow-list; `classifyInstrumentLinkSourceDomain`
  reduces a pasted URL to a bounded 5-value domain enum instead of
  sending the raw URL).
- **`<Analytics />` mounted once** in `src/app/layout.tsx` (root layout,
  outside the `(app)` route group), so every route — including
  `/sign-in`, `/verify-email`, `/reset-password` — is covered. No
  `<Suspense>` wrapper was needed (verified against the installed
  package: it does not call `useSearchParams()`).
- **`src/components/pulse/tax-export-link.tsx` (new):** small Client
  Component wrapping the tax-export `<a>` link, reused by both
  `tax-client.tsx` and the async Server Component
  `tax/[year]/anlage-so/page.tsx`, so the export-click event can fire
  without converting either page to a Client Component.
- **~20 call sites wired** across `upload-dropzone.tsx`,
  `auth-card.tsx`, `tax-year-selector.tsx`, `loss-harvest-panel.tsx`,
  `positions-sort.tsx`, `sector-filter.tsx`, `instrument-source-card.tsx`,
  `pnl-mode.tsx`, `dividends-table.tsx`, `range-picker.tsx`,
  `reset-broker-button.tsx`, `crypto-accounts-manager.tsx`,
  `members-manager.tsx`, `tax-income-row.tsx`, `backfill-fx-button.tsx`,
  `refresh-quotes-button.tsx`, `topbar-nav.tsx`, `bottom-nav.tsx`, and
  `welcome-tour.tsx` — each firing on a verified, currently-live
  interaction point, per the AC's per-event allow/deny property lists.
- **`welcome-tour.tsx` refactor:** extracted a shared `closeTourState()`
  helper so `dismiss()` and `finish()` each own exactly one exit-path
  branch. This also fixes a pre-existing bug where `finish()` routed
  through `dismiss()` and would have double-fired both an
  `onboarding_tour_dismissed` and an `onboarding_tour_completed` event
  on every successful tour completion.
- Zero new PII fields, tables, or columns — purely client-side
  instrumentation calling a third-party (Vercel-hosted) collection
  endpoint with bounded, allow-listed payloads.

**Why:** The team has no visibility into which features (Upload, Tax
export, Loss Harvest, onboarding) actually get used. This adds that
signal without ever capturing amounts, identities, or anything that
could re-identify a user's specific holdings or income — see AC-G1/G2's
global allow/deny rules and the AC doc's per-event forbidden-property
notes (e.g. no `taxableIncomeEur`, no raw URLs, no ISIN/symbol values).

**Review:** `code-reviewer` approved with no blocking issues; one minor
type-widening fix was applied and reverified. Full verification clean:
typecheck, lint, build, and test suite (909 passed, 0 failed), including
66 new tests in `tests/lib/analytics-events.test.ts`.

See [AC doc](superpowers/specs/2026-08-07-analytics-events-ac.md) /
[design spec](superpowers/specs/2026-08-07-analytics-events-design.md).

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
  deletion). **Superseded 2026-08-08:** this line is no longer accurate —
  the Role System & Admin Panel entry below adds admin-triggered account
  deletion, which product has designated as the app's GDPR Art. 17 erasure
  mechanism going forward. Kept here as the historical record of the state
  as of 2026-08-05, not current behavior; there is still no *self-service*
  (user-initiated) deletion flow — an admin must act.
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
