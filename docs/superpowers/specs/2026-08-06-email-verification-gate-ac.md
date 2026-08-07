# Email Verification Gate + Live Cross-Tab/Cross-Device Auto-Login — Acceptance Criteria

**Date:** 2026-08-06
**Status:** Draft — ready for architect
**Author:** business-analyst
**Related:** `docs/superpowers/specs/2026-08-05-open-signup-ac.md` (AC-2, AC-4, AC-14…AC-16,
Open Question 6), `docs/superpowers/specs/2026-08-05-open-signup-design.md` (§3, §4,
§11, §14) — **this doc explicitly changes/supersedes specific prior decisions; see
§0 below, not a silent rewrite.**
**Touches:** `src/lib/auth/setup.ts`, `src/components/auth/auth-card.tsx`,
`src/lib/auth/server.ts`, `src/app/(app)/layout.tsx`, `src/lib/auth/client.ts`,
`src/lib/auth/auth-emails.ts` (no change expected), possibly a new
`src/app/verify-email/` or similar waiting-state route.

This doc reuses, rather than re-derives, the auth business logic already
established by the 2026-08-05 open-signup work (password policy, rate
limiting, anti-enumeration posture, resend-verification endpoint, the
`verification`/`user`/`session` schema). Only the specific behaviors called
out in §0 change.

---

## 0. What this feature explicitly changes vs. the prior (2026-08-05) decisions

The prior AC doc's **Open Question 6 / AC-15** deliberately left "does
unverified email block sign-in" open with two acceptable resolutions, and
the design doc's **§11** resolved it to **(a) nudge-only**: sign-up
auto-signs the user in immediately (`autoSignIn: true`,
`requireEmailVerification: false`), and an unverified user merely sees a
banner (`auth-card.tsx`'s `unverifiedNudge` state) — access is never
blocked.

**This feature reverses that resolution to (b) block-until-verified**, per
the new user request. Concretely, this doc's ACs require:

- `requireEmailVerification: true` (currently `false`) in
  `src/lib/auth/setup.ts`'s `emailAndPassword` config.
- `emailVerification.autoSignInAfterVerification: true` (currently unset).

Both are real, already-shipped better-auth config keys — confirmed by
reading `node_modules/better-auth/dist/api/routes/email-verification.mjs`
(lines 268-287, `autoSignInAfterVerification` branch) and
`.../sign-up.mjs` (lines 160-161, 249) directly, not assumed from memory.
Flipping `requireEmailVerification` to `true` has two **verified,
non-optional side effects** the architect must account for (not silently
rediscover later):

1. **Auto-sign-in on brand-new sign-ups is also disabled**
   (`shouldSkipAutoSignIn` in `sign-up.mjs` is checked on *every* sign-up,
   not just duplicates, and is `true` whenever `requireEmailVerification`
   is `true`). This is actually **wanted** here — it's the mechanism that
   satisfies AC-1 below (no auto-redirect into the app) — but it is a
   change to the *general* sign-up code path, not something scoped only to
   the "verify before access" behavior.
2. **Duplicate-email sign-up (AC-4 in the prior doc) silently flips from a
   revealing `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` (422) response to a
   non-revealing synthetic-success response**, because
   `shouldReturnGenericDuplicateResponse = requireEmailVerification ||
   autoSignIn === false` also becomes `true`. See AC-14 below — this is a
   real behavior change to an already-shipped, already-tested code path
   (`auth-card.tsx`'s `mapAuthErrorMessage` currently has a live branch for
   that error code) and must be handled deliberately, not left as an
   accidental regression.

## 1. Goal

As a user of this German investment-tax-data app, when I sign up with
email + password, I should not be able to use the app until I've proven
ownership of my email address. Once I click the verification link — in
the same tab, a new tab, or an entirely different device/browser — every
tab/session waiting on that verification should transition into the app
live, with no manual refresh and no re-entering credentials.

## 2. Scope

In scope:
- Gating `(app)` route access on `user.emailVerified`, not just on session
  existence.
- Sign-up UI: waiting/"check your email" state instead of immediate
  redirect, for the email+password path only.
- A live (no-manual-refresh) mechanism for the originating tab to detect
  verification completion.
- The cross-device case (verification link opened in a different
  browser/device than the one that submitted sign-up).
- Edge cases: expired link, already-verified link reused, non-existent
  account, closed origin tab, multiple concurrent sign-up attempts in one
  browser.

Explicitly out of scope (flag, don't silently fold in):
- OAuth sign-up/sign-in — Google/GitHub accounts already get
  `emailVerified: true` at creation (per prior AC-16) and are **not**
  affected by this gate; this doc does not reopen that decision.
- The allowlist/`AUTH_SIGNUP_MODE` restricted-mode gate — unaffected,
  orthogonal (per prior doc's Terminology section, §4).
- Password-reset flow, custom-domain migration, abandoned-account cleanup
  cron — all already shipped/specified in the 2026-08-05 docs, untouched
  here.
- Any tax/ledger/Anlage logic.
- Building a persistent WebSocket/push-notification server. The task brief
  flags this as probably overkill for a one-time, low-frequency event, and
  a realistic polling-based fallback exists for the cross-device case —
  final call on mechanism is the architect's, not asserted here, but no AC
  below requires a persistent connection.

## 3. Current state (confirmed by reading code, not assumed)

- `src/lib/auth/setup.ts`: `requireEmailVerification: false`, `autoSignIn:
  true`, `emailVerification.sendOnSignUp: true` (verification email
  already sent unconditionally on every credential sign-up), no
  `autoSignInAfterVerification` key present.
- `src/components/auth/auth-card.tsx`: sign-up currently redirects to `/`
  immediately (`window.location.href = "/"`); an `unverifiedNudge` banner
  renders only if a later sign-in reveals `emailVerified === false` on an
  already-created session. There is no "waiting for verification" state
  today because one has never been needed (access was never blocked).
- `src/lib/auth/server.ts`'s `requireCurrentUser()` — the **single, actual
  gate point** for every `(app)` route (called from
  `src/app/(app)/layout.tsx`) — checks only session existence
  (`session?.user?.email`), never `emailVerified`. There is no
  `middleware.ts` in this repo; all route protection flows through this
  one server-side layout check.
- Verification tokens are **stateless JWTs**, 1-hour default TTL, no DB
  row (confirmed: `email-verification.mjs` uses `signJWT`/`jwtVerify`
  against `BETTER_AUTH_SECRET`, never touches the `verification` table).
  Re-using an already-verified-but-still-fresh token is **idempotent
  success** (`status: true, user: null`, `email-verification.mjs:258-264`),
  not an error.
- `/send-verification-email` (the existing resend endpoint, already wired
  to `authClient.sendVerificationEmail`) already has anti-enumeration
  behavior **with no session present** (confirmed,
  `email-verification.mjs:93-100`): if the email has no account, or the
  account is already verified, it returns `{status: true}` **without
  actually sending an email** — same non-revealing shape either way. It is
  already covered by better-auth's built-in special rate-limit rule (3
  requests/60s per IP — confirmed in the 2026-08-05 design doc §15,
  `create-context.mjs`'s `getDefaultSpecialRules()`). No new resend
  endpoint or new rate-limit rule needs to be built.
- `/verify-email` (GET), on success, sets `emailVerified: true` and, if
  `autoSignInAfterVerification` is on, creates a **new session and sets
  the session cookie in whatever browser loaded that link**
  (`email-verification.mjs:268-287`), then redirects to `callbackURL`.
  This is an existing, verified library behavior — no custom session-
  minting code is needed for "the tab that clicked the link gets signed
  in" (requirement 4 in the task brief).
- **better-auth's React client (`src/lib/auth/client.ts` uses
  `better-auth/react`) already ships a cross-tab session-sync primitive**
  (`node_modules/better-auth/dist/client/broadcast-channel.mjs` +
  `session-refresh.mjs`): a `localStorage`-`storage`-event-based channel
  (confusingly named "broadcast channel" internally — it is not the
  `BroadcastChannel` Web API, it's a `localStorage.setItem` +
  `window.addEventListener("storage", ...)` shim, which is exactly the
  primitive the task brief already correctly anticipated), plus optional
  `refetchInterval` polling and refetch-on-window-focus/online. **However,
  verified directly from source
  (`node_modules/better-auth/dist/client/config.mjs:73-74`): the client
  only actually posts to this channel on `/sign-out`,
  `/update-user`/`/update-session` — never on `/sign-in`, and the
  `/verify-email` link is a plain server-side GET redirect, not a call
  made through `authClient`'s `$fetch` at all.** So, out of the box,
  completing verification in one tab does **not** automatically notify a
  waiting tab in the same browser. This is a real gap this feature must
  close (e.g. by having the verification-landing page explicitly call
  something that posts to that channel, or roll an equivalent signal) —
  flagged so the architect designs it deliberately rather than assuming
  the library already handles it.
- Cookies (and therefore sessions) are **browser/profile-scoped, not
  tab-scoped**: once `/verify-email` sets the session cookie in a new tab
  in the *same* browser as the waiting tab, that cookie is immediately
  visible to every tab of that origin, including the original waiting tab
  — no session needs to be "transferred" between tabs in the same-browser
  case, only a signal to make the waiting tab re-check *now* instead of on
  its next poll/focus event. This is materially different from the
  cross-device case (§6 below), where no such shared cookie jar exists.

## 4. Sign-up flow — blocked redirect, waiting state, resend

**AC-1 (no redirect on sign-up)**
Given a visitor submits the sign-up form with a syntactically valid,
previously-unused email and a password meeting policy (unchanged from
prior AC-3),
When the account is created,
Then the visitor is **not** redirected into the app and receives **no**
session — the sign-up response contains a user object but no auth token
(consistent with `requireEmailVerification: true` disabling auto-sign-in;
§0 point 1) — and the same tab instead renders a waiting state.
*(Supersedes prior AC-2's "signed in and redirected to `/`" clause for the
email+password path.)*

**AC-2 (waiting-state content)**
Given the sign-up succeeded per AC-1,
Then the waiting state displays the submitted email address, states a
verification email was sent to it, and offers a "resend verification
email" action — reusing the existing `authClient.sendVerificationEmail`
call already wired in `auth-card.tsx`, not a new endpoint.

**AC-3 (resend action)**
Given the visitor is on the waiting state and clicks "resend,"
When the request is made,
Then it behaves per the already-verified library behavior in §3 (silent
no-op if somehow already verified/nonexistent, real send otherwise) and is
subject to the existing 3-requests/60-seconds-per-IP rate limit — no new
resend logic or new rate-limit configuration is required; the UI must
reflect a rate-limited rejection with a clear "too many requests, try
again shortly" style message rather than a silent failure or the generic
default error.

**AC-4 (validation/duplicate-email unaffected in kind, changed in shape —
see §0 point 2)**
Given the same password-policy and email-format validation as prior AC-3,
Then rejection behavior for empty/malformed input is unchanged.
Given an email that already has an account (any provider),
When sign-up is attempted again,
Then — because of the verified side effect in §0 point 2 — the server
returns the same **non-revealing synthetic-success response** as a
brand-new sign-up (no distinguishing error code), so the client **must
not** rely on `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` to detect this case
(that branch becomes unreachable for this path) and must instead show the
same waiting state regardless of whether the account was new or
pre-existing — exactly mirroring the anti-enumeration posture already
established for `/forgot-password` (prior AC-17). This is a **required**
change to `auth-card.tsx`'s existing error-mapping usage on the sign-up
call, not optional cleanup.

**AC-5 (OAuth unaffected)**
Given a visitor signs up via Google or GitHub,
When the account is created (`emailVerified: true` already, per prior
AC-16),
Then sign-up behaves exactly as before this feature — auto-signed-in,
redirected to `/`, no waiting state, no verification email. This gate
applies only to the email+password path.

## 5. Server-side meaning of "verified" and route gating

**AC-6 (gate definition)**
Given a user has an active session but `user.emailVerified === false`,
When they attempt to load any route under the `(app)` route group,
Then they are **not** granted access — the existing single gate point
(`requireCurrentUser()` in `src/lib/auth/server.ts`, called from
`src/app/(app)/layout.tsx`) must also check `emailVerified`, redirecting
to the sign-in/waiting surface instead of rendering the page. This reuses
the existing single-choke-point pattern already in the codebase (no
`middleware.ts` exists or needs to be introduced solely for this) rather
than introducing a second, parallel gating mechanism — the architect may
relocate the check into actual `middleware.ts` only if there's an
independent reason to do so, but must not leave two divergent gates.

**AC-7 (sign-in with unverified account, post-change)**
Given an existing email+password account where `emailVerified === false`
attempts to sign in with correct credentials,
Then, per better-auth's own verified `requireEmailVerification: true`
behavior (`sign-in.mjs:229-241` — `FORBIDDEN`/`EMAIL_NOT_VERIFIED`), the
sign-in call itself is rejected rather than succeeding into a nudge state
— the existing `unverifiedNudge` banner and its "Continue to Folio"
skip-through link in `auth-card.tsx` must be removed or repurposed into
the waiting/resend state from §4, since "sign in but stay unverified and
nudged" is no longer a reachable state. The UI copy must not claim access
is available when it is not (reusing prior AC-15's own requirement that
copy match actual behavior).

**AC-8 (verified users unaffected)**
Given a user with `emailVerified === true` (OAuth, or a credential account
that completed verification),
Then route access, sign-in, and session behavior are unchanged from
today.

## 6. Same-browser cross-tab live sync

**AC-9 (instant, not eventual, transition)**
Given a visitor has the waiting-state tab open (from AC-1) and, in a
**second tab of the same browser**, opens the verification link and it
succeeds,
When verification completes,
Then the original waiting tab transitions into the signed-in app state
within a short, testable bound (e.g. under ~2 seconds of the link
resolving) **without the user performing any action in that tab** — no
manual refresh, no re-submitting the form. Given the cookie-sharing fact
in §3, the mechanism only needs to (a) notice "something changed" close to
instantly and (b) re-check session/verification state — it does not need
to transfer any session data between tabs.
*(The exact signaling primitive — extending better-auth's existing
localStorage-based channel per §3, a plain `BroadcastChannel`, or
polling — is the architect's call; either satisfies this AC as long as
the ~2-second bound holds. Long-interval polling alone, e.g. only on
window focus, does not satisfy "live" unless the bound above is met.)*

**AC-10 (same-tab click also completes)**
Given the visitor instead clicks the verification link **in the same tab**
that was showing the waiting state (e.g. they didn't open a new tab),
Then that tab, via better-auth's own `autoSignInAfterVerification`
redirect behavior (§3), lands signed in on the `callbackURL` without any
custom cross-tab mechanism being involved at all.

**AC-11 (correct-account scoping when multiple sign-up attempts are open)**
Given a browser has **two** waiting-state tabs open for two **different**
email addresses (e.g. two family members signing up on a shared
computer, or one person testing a typo'd retry),
When the verification link for email A is completed,
Then only the tab waiting on email A transitions to signed-in; the tab
waiting on email B must **not** transition, and must not be misled into
believing its own signup succeeded merely because *a* session now exists
in the browser. The sync signal must be scoped/correlated (e.g. by email
or a per-attempt identifier), not a bare "a session changed somewhere"
event — this is a required correctness property, not an edge case to
skip, since the shared-cookie-jar behavior in §3 would otherwise make
tab B's naive session re-check pass with the wrong identity.

**AC-12 (closing the origin tab has no effect on verification itself)**
Given the visitor closes the original waiting tab before clicking the
verification link,
Then the verification link still functions exactly as normal when later
opened (there is nothing left to notify, but the link itself is a
standalone, complete action) — no error state is expected purely from the
origin tab being gone.

## 7. Cross-device fallback

**AC-13 (cross-device transition, mechanism must actually grant a session
— not just detect completion)**
Given a visitor signs up on Device A (browser/session with no cookie for
this account yet, by definition, since sign-up did not auto-sign-in per
AC-1) and opens the verification link on **Device B** (a different
browser or device entirely — no shared cookie jar with Device A),
When verification completes on Device B,
Then Device A's waiting tab must, without the user re-entering
credentials on Device A, end up with its own valid session for that
account. **This is not simply a matter of Device A detecting that
verification happened** (there is no session cookie on Device A for the
new account to "reveal" via polling `/get-session` — unlike the
same-browser case in §6, cookies do not travel between devices) — the
server must have some mechanism to mint/grant Device A its own session
once it learns verification succeeded (e.g., a short-lived,
correlation-bound token issued to Device A at sign-up time and exchanged
for a session once the server observes `emailVerified` flip to `true` for
that account). The exact mechanism is the architect's design decision
(Open Question 1 below), but "poll and then just call get-session again"
is **not sufficient on its own** for this case and must not be assumed to
work by extrapolating from the same-browser case.

**AC-14 (polling cadence, if polling is chosen)**
If the architect's chosen mechanism for AC-13 involves Device A polling a
server endpoint to check completion, then that endpoint must be
rate-limited (consistent with this codebase's existing posture of
explicit `rateLimit: { enabled: true }` coverage on auth-adjacent
endpoints, prior design doc §7.1/§15) and must **not** introduce a new
account-enumeration or user-existence oracle — i.e., it must be
correlated via an opaque, unguessable per-sign-up-attempt identifier
handed to Device A at sign-up time, not by accepting a raw email address
as the lookup key (which would let an attacker probe arbitrary addresses
for "does this account exist / is it verified"). This directly reuses the
anti-enumeration discipline already established for `/forgot-password`
and duplicate sign-up (§0 point 2, AC-4) rather than introducing a new,
inconsistent posture.

**AC-15 (cross-device works even if Device A's tab was opened, closed, and
Device A never returns)**
Given Device A's waiting tab is simply closed and never reopened,
Then no error state or orphaned resource is expected — the verification
itself still succeeds on Device B and that user can sign in normally on
Device A later through the ordinary sign-in form (this is the fallback of
last resort and must always work, independent of whether the live-sync
mechanism ever fired).

## 8. Expiry and other edge cases

**AC-16 (expired link)**
Given a verification link older than the configured TTL (1 hour, per
existing `emailVerification.expiresIn`, unchanged by this feature),
When opened,
Then the visitor sees a clear "link expired — request a new one" state
(reusing the same pattern as the existing `/reset-password` page's
expired-token state, per `TOKEN_EXPIRED`/`INVALID_TOKEN` handling already
established there) with a way to trigger a resend (AC-3), and no side
effect occurs (`emailVerified` is not flipped).

**AC-17 (already-verified link reused within TTL)**
Given a verification link that is still cryptographically valid but the
account is already verified (the visitor clicked it twice, or clicked it
after already verifying via another tab/device),
Then — per the verified idempotent-success behavior in §3 — this must be
presented to the user as a success/"you're already verified, continue to
the app" state, **not** an error, matching what better-auth's route
actually returns (`status: true, user: null`) rather than inventing a
generic failure message for this specific, verified-idempotent case.

**AC-18 (account doesn't exist)**
Given a verification token whose associated account no longer exists
(e.g., deleted by the existing 6-month abandoned-account cleanup sweep,
or any other deletion path) — an edge case, not the common path,
When the link is opened,
Then the visitor sees the same generic "link expired or invalid" style
state as AC-16, **not** a message that reveals whether an account
existed (consistent with this codebase's established anti-enumeration
posture).

**AC-19 (malformed/tampered token)**
Given a malformed or tampered token,
Then the same generic "link expired or invalid" state as AC-16 is shown
— no distinct error path that could leak information about why it's
invalid.

## 9. GDPR-relevant considerations (flag for `gdpr-compliance` review, not resolved here)

- No new personal data category is introduced by this feature — the
  verification link/email content is unchanged from what's already
  documented as a Resend-processed data flow in
  `docs/superpowers/specs/2026-08-05-open-signup-data-lifecycle.md`
  (AC-27 there already names Resend as subprocessor, states region, and
  covers link/token content).
- If the cross-device mechanism (AC-13) introduces any new server-side
  state (e.g. a short-lived correlation token/row tying Device A's
  waiting session to a sign-up attempt), that new state must be added to
  the existing data-lifecycle inventory (table/column, what triggers
  creation/deletion, TTL) — this is a **documentation-writer follow-up**,
  not something to skip because the prior data-lifecycle doc predates
  this feature.
- Blocking access until verification is a **stronger** proof-of-ownership
  posture than the prior nudge-only design, which the prior doc's own
  Section 7 risk log flagged as a known gap ("no proof-of-ownership
  before account starts touching financial/PII data"). This feature
  directly closes that previously-flagged risk — worth noting explicitly
  in the eventual changelog entry as a security/GDPR-posture improvement,
  not just a UX change.
- No new third-party subprocessor is introduced (no push/WebSocket
  service, assuming the architect follows the task brief's steer away
  from that per §2's scope note). If the architect nonetheless chooses a
  hosted realtime/push provider for the cross-device case, that would be
  a new subprocessor requiring the same disclosure treatment as Resend
  received (prior AC-27) — flagged conditionally, not assumed.

## 10. Open questions for the architect (decisions needed, not assumed here)

1. **Cross-device session-granting mechanism (AC-13/AC-14).** Concrete
   shape of the correlation token/exchange is unspecified here — needs a
   `software-architecture` design decision, informed by
   `nextjs-security` on the anti-enumeration requirement in AC-14.
2. **Same-browser signal primitive (AC-9/AC-11).** Whether to extend
   better-auth's existing localStorage-shim channel (posting to it
   explicitly from the verification-landing page/callback), use the
   native `BroadcastChannel` API directly, or poll — architect's call,
   any satisfies AC-9's latency bound.
3. **Where the "waiting" UI lives.** Whether it's a state within
   `auth-card.tsx` (as sketched in AC-2) or a dedicated route (mirroring
   how `/reset-password` got its own page) — architect's call, consistent
   with this repo's existing pattern of a dedicated page for the
   token-bearing half of a two-hop auth flow.
4. **`unverifiedNudge` UI removal/repurposing (AC-7).** Whether to delete
   that state outright or reuse its layout for the new waiting state —
   implementation detail, not a business-logic question.
5. **Duplicate-sign-up UI copy (AC-4).** Exact wording for the
   now-unified "check your email to continue" message that must cover
   both "brand new account" and "this email already had an account"
   without revealing which — `nextjs-security`/`code-reviewer` should
   weigh in, consistent with how prior AC-4/AC-17 were treated.

## 11. Traceability

AC-1…AC-19 above are numbered for 1:1 mapping by `tester` and
`code-reviewer`, independent of the prior doc's AC-1…AC-29 numbering.
Where an AC here supersedes a specific prior AC/design-doc section, that
is stated inline (§0, AC-1, AC-4) rather than left implicit.

## 12. Documentation follow-up (for `documentation-writer`, once implemented)

- Add a superseding note on the prior AC doc's **AC-15** and the design
  doc's **§11**, pointing at this doc, rather than editing their text in
  place — consistent with this repo's existing changelog discipline of
  not silently rewriting prior statements (see how Amendment 1 handled
  its own supersessions).
- Add this feature's entry to `docs/INDEX.md` under Business Logic,
  cross-linked with the existing open-signup entry.
- Extend `docs/superpowers/specs/2026-08-05-open-signup-data-lifecycle.md`
  if the chosen cross-device mechanism (AC-13) adds any new server-side
  state (§9).
- Record the change in `docs/CHANGELOG.md`, explicitly noting it reverses
  the nudge-only decision and closes the proof-of-ownership gap flagged in
  the prior doc's risk log (§9 above).
