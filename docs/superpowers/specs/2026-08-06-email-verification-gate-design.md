# Email Verification Gate — Design Spec

Architect deliverable for the `developer` agent, against
`docs/superpowers/specs/2026-08-06-email-verification-gate-ac.md` (AC-1…AC-19,
§0/§3/§9/§10). §3 of that doc is treated as already-verified ground truth; this
doc adds the source citations needed for the *new* surface (cross-device
grant, same-browser sync, plugin/rate-limit wiring) and resolves the 5 open
questions in §10.

Skills applied: `software-architecture` (modularity/least-privilege sections
below), `gdpr-compliance` (data-minimization notes on the new table/column).

## 0. What changes, in one paragraph

`requireEmailVerification` flips to `true`. Sign-in on an unverified account
now hard-rejects (`EMAIL_NOT_VERIFIED`/`FORBIDDEN`) instead of nudging.
Sign-up's duplicate-email branch already returns a generic
`{token: null, user: <synthetic>}` once `requireEmailVerification: true`
(better-auth's own `shouldReturnGenericDuplicateResponse` — no code change
needed there, just the flag flip). New surface: (1) a same-browser live-sync
signal via `BroadcastChannel`, reusable by both the fresh-signup wait state
and the blocked-sign-in resend state; (2) a cross-device session-grant
mechanism, scoped **only** to fresh sign-up, backed by a new table and a new
better-auth plugin endpoint; (3) a dedicated `/verify-email` landing route;
(4) `requireCurrentUser()` gains an `emailVerified` check to close the
grandfathered-session gap (AC-6).

## 1. Grounding: what I verified in `node_modules/better-auth@1.6.11` beyond §3

All paths below are under
`node_modules/.pnpm/better-auth@1.6.11.../node_modules/better-auth/dist/`
unless marked `@better-auth/core`.

- **`api/routes/sign-up.mjs:140-260`** — full request handling, read end to
  end:
  - `body` is destructured as `{name, email, password, image, callbackURL,
    rememberMe, ...rest}` (line 147) — `callbackURL` is a **named,
    already-supported** field, never merged into `rest`/additionalFields.
    `rest` is passed through `parseUserInput(options, rest, "create")` (line
    162) — this is the passthrough vehicle for any `user.additionalFields`
    entry.
  - Duplicate-email branch (`dbUser?.user` truthy, line 165): computes
    `additionalUserFields` **before** the duplicate check, so the synthetic
    user echoes them too (`syntheticUser = {...coreFields,
    ...additionalUserFields, id: generatedId}`, line 195-199) — but this
    branch **never calls `internalAdapter.createUser(...)`**, so no DB row
    for a duplicate signup ever exists to bind a correlation token to. This
    is the load-bearing security invariant for Open Question 1 below.
  - Genuine-create branch (line 215-248): `internalAdapter.createUser({...,
    ...additionalUserFields, emailVerified: false})` persists whatever
    `rest` fields were declared as `user.additionalFields` as **real
    columns**. Verification email is sent here using `body.callbackURL`
    verbatim (line 241-242): `` `${baseURL}/verify-email?token=${token}&callbackURL=${encodeURIComponent(body.callbackURL ?? "/")}` ``.
- **`api/routes/email-verification.mjs`** (full file read):
  - `verifyEmail` (`GET /verify-email`, line 109-293) only ever redirects if
    `ctx.query.callbackURL` is present — which it always is by construction,
    because `sendVerificationEmailFn`/sign-up's inline sender both default it
    to `"/"` when the caller didn't supply one (line 28, line 241). So a
    client-supplied `callbackURL` of `/verify-email?attemptId=<id>` survives
    unmodified into the redirect target.
  - Error redirect (`redirectOnError`, line 151-157) appends
    `&error=<code>` or `?error=<code>` to that same callback URL depending on
    whether it already has a `?` — i.e. `TOKEN_EXPIRED` (AC-16),
    `INVALID_TOKEN` (AC-19), `USER_NOT_FOUND` (AC-18) all land on
    `/verify-email?attemptId=<id>&error=<CODE>`, never a different route.
  - Success path (line 258-292): `updateUserByEmail(..., {emailVerified:
    true})`, then if `emailVerification.autoSignInAfterVerification` is set,
    mints/sets a session via `internalAdapter.createSession` +
    `setSessionCookie` (same-tab auto-sign-in, AC-10), **then** redirects to
    the callback URL — confirming the redirect target (`/verify-email` page)
    always runs with the fresh session cookie already set, in the tab that
    clicked the link.
  - Already-verified path (line 258-264, AC-17 idempotency): if
    `user.emailVerified` is already true, just redirects (or returns JSON) —
    no error, no re-verification — confirms the AC doc's "idempotent success"
    framing is accurate as shipped, no new code needed for AC-17 itself.
- **`api/index.mjs:149-190`** — `originCheckMiddleware` is registered as a
  **global** `routerMiddleware` on `/**`, applied ahead of any
  plugin-supplied middleware — i.e. every custom plugin endpoint (including
  the new poll endpoint below) gets same-origin enforcement for free, no opt-in
  needed. (The *additional*, separate `originCheck((ctx) =>
  ctx.query.callbackURL)` on `verifyEmail` is a distinct, narrower concern:
  validating the redirect-target query param itself against open-redirect,
  not the request's origin.)
- **`plugins/email-otp/index.mjs`** (full file read) — confirms the exact
  plugin shape this repo should reuse: a factory returning `{id, version,
  endpoints: {name: createAuthEndpoint(path, {method, body}, handler)},
  hooks: {after: [...]}, rateLimit: [{pathMatcher(path), window, max}, ...]}`.
  `rateLimit` entries use `pathMatcher(path)` (plugin-level), a different
  shape from the core `getDefaultSpecialRules()` array used by
  `/sign-in*`/`/sign-up*` (path-prefix based) — both are merged by
  better-auth's rate-limiter (`api/rate-limiter/index.mjs`,
  `ctx.rateLimit.customRules` folding in `(plugin.rateLimit ||
  []).map(...)` per plugin). Confirms the repo's existing "declarative
  rule, not bespoke middleware" convention (design doc
  `2026-08-05-open-signup-design.md` §7.1/§15) extends cleanly to a new
  plugin endpoint.
- **`plugins/email-otp/routes.mjs:307-330`** — exact session-minting pattern
  to reuse verbatim in the new poll endpoint: `const session = await
  ctx.context.internalAdapter.createSession(updatedUser.id); await
  setSessionCookie(ctx, {session, user: updatedUser});`.
- **`db/schema.mjs:1-97`** (`getFields`/`parseInputData`/`parseUserInput`,
  `@better-auth/core/utils/db`'s `filterOutputFields`) — additional-field
  shape is `{type, required, input, returned, defaultValue}`.
  `filterOutputFields` (verified in
  `@better-auth/core/dist/utils/db.mjs:6-13`) strips any field with
  `returned === false` from **every** output path — `parseUserOutput` is
  called on both the genuine-create response and the synthetic-duplicate
  response, so `returned: false` hides the new field from both without a
  branch of its own.
- **`db/with-hooks.mjs`** — `databaseHooks.user.create.before` runs
  synchronously in-line; `.create.after` hooks run wrapped in
  `queueAfterTransactionHook(...)` — **not guaranteed to complete before the
  sign-up HTTP response is written**. This is why the client's poll loop
  must treat "no row yet" as "still pending," not "invalid" (§2.3 below).
- Rejected mechanism, verified and ruled out:
  `client/broadcast-channel.mjs` + `@better-auth/core`'s session-refresh
  config — better-auth's own cross-tab notification uses
  `localStorage.setItem("better-auth.message", ...)` + a `storage` event
  listener (not the native `BroadcastChannel` API despite the file name),
  fires only for `/sign-out`, `/update-user`, `/update-session` (confirmed
  by the `pluginPathMethods`/matcher list), and carries a fixed `{event:
  "session"}` shape with no per-attempt scoping. Extending this internal,
  undocumented shim was rejected in favor of an app-owned native
  `BroadcastChannel` (Open Question 2).

## 2. Open Question 1 (AC-13/AC-14) — cross-device session grant — RESOLVED

### 2.1 The security invariant this design is built around

A naive "poll by email, grant whatever account matches" design is an
account-takeover bug: AC-4/AC-14 require sign-up-for-an-existing-email to
return the **same generic response** as a genuine sign-up, so an attacker
could sign up with a victim's (possibly already-verified) email and have
their own polling tab silently mint a session for the victim's real account
the moment the attacker's poll runs — no password needed.

**Invariant**: the correlation token must only ever be bound to a `user` row
that this exact request *genuinely created*. Structurally enforced because
`databaseHooks.user.create.after` fires only via
`internalAdapter.createUser(...)`, and §1 confirms the duplicate branch
never reaches that call. The token is never looked up by email, at any point
in this design.

### 2.2 Shape

- Client generates `signupAttemptId = crypto.randomUUID()` **before** calling
  `authClient.signUp.email(...)`.
- Sent as an ordinary extra body field (not a named better-auth field);
  declared in `setup.ts`:
  ```ts
  user: {
    additionalFields: {
      signupAttemptId: { type: "string", required: false, returned: false },
    },
  },
  ```
  `returned: false` means it never appears in *any* sign-up response
  (genuine or synthetic-duplicate) — see §1.
- `databaseHooks.user.create.after` (new — the `user.create` hook object
  currently only has `before`, used for the allowlist check; `after` is a
  sibling key):
  ```ts
  create: {
    before: async (user) => { /* existing allowlist check, unchanged */ },
    after: async (createdUser) => {
      const attemptId = (createdUser as { signupAttemptId?: string | null }).signupAttemptId;
      if (attemptId) {
        await getDb().insert(signupAttempts).values({
          attemptId,
          userId: createdUser.id,
          expiresAt: new Date(Date.now() + 3600 * 1000), // matches emailVerification.expiresIn
        });
        // Data minimization: the durable copy now lives in signupAttempts;
        // the transient passthrough column on `user` has served its
        // purpose. Mirrors the OAuth-token-nulling precedent in
        // account.create.before (design doc §24).
        await getDb().update(user).set({ signupAttemptId: null }).where(eq(user.id, createdUser.id));
      }
    },
  },
  ```
- New table `signupAttempts` (see §5 for full column list) holds
  `{attemptId, userId, expiresAt, consumedAt}`.
- New better-auth plugin, `POST /signup-attempt/claim`, body `{attemptId:
  string}`:
  1. `SELECT ... FROM signup_attempts JOIN "user" ON user.id =
     signup_attempts.user_id WHERE attempt_id = $1 AND consumed_at IS NULL
     AND expires_at > now()`.
  2. No row → `{status: "pending"}`. (Covers three indistinguishable cases —
     the after-hook hasn't run yet, per §1's async-timing finding; the
     token never existed; or it already expired — collapsing them is
     intentional: nothing here should let a client distinguish
     "wrong/attacker-guessed id" from "still catching up," which would leak
     information about valid-id shape.)
  3. Row found, joined `user.emailVerified === false` → `{status:
     "pending"}` (still waiting on the email click).
  4. Row found, `emailVerified === true` → atomically mark it consumed
     (`UPDATE signup_attempts SET consumed_at = now() WHERE attempt_id = $1
     AND consumed_at IS NULL`, checking the row count to guard the
     race against a second concurrent poll from another tab claiming the
     same attempt), mint + set session exactly like
     `email-otp/routes.mjs:307-330` (`internalAdapter.createSession` +
     `setSessionCookie`), return `{status: "granted"}`.
- Rate limit (plugin-level, following §1's `email-otp` precedent):
  `pathMatcher: (path) => path === "/signup-attempt/claim"`, `window: 30`,
  `max: 15` — bounds abuse while comfortably supporting a 2-3s client poll
  interval. **Flagged for `nextjs-security`/`code-reviewer` sign-off on the
  exact numbers**, per this repo's established practice of not silently
  picking security-relevant constants (design doc §7.1 flagged its rule set
  the same way).

### 2.3 Client poll loop (`auth-card.tsx` wait state)

- Starts polling `POST /api/auth/signup-attempt/claim` immediately after a
  successful sign-up response, every 3s.
- `"granted"` → `window.location.href = "/"` (session cookie is already set
  by the endpoint).
- `"pending"` → keep polling. No special-cased short grace window is needed
  server-side (unlike a naive design might assume) because "pending" already
  covers the async-hook-lag case by construction (§2.2 step 2) — the client
  doesn't need to know *why* it's pending, only that it should keep trying.
- Stop after 10 minutes of polling (matches realistic email-delivery-latency
  expectations) or when `document.visibilityState !== "visible"` (Page
  Visibility API), resuming on visibility regain — bounds load from
  backgrounded tabs without extra server logic.
- Scope: **fresh sign-up only** (AC-1/AC-2/AC-13/AC-14). The AC-7
  blocked-sign-in → resend path is deliberately **not** extended to
  cross-device grant: `POST /send-verification-email`'s body schema is
  `{email, callbackURL}` (§1, `email-verification.mjs:39-42`) with no
  passthrough field, and there is no create-hook to bind a fresh token to
  (the user already exists) — extending this would mean either widening
  better-auth's own endpoint schema (out of scope, invasive) or minting a
  second, differently-sourced correlation token bound by email lookup,
  which reopens the exact enumeration/account-takeover risk §2.1 rules out.
  AC doc does not require cross-device grant for AC-7. **Flagged deviation:
  none — this is the AC doc's own scoping, not a substitution.**

### 2.4 DB/schema & lifecycle

New table, `src/lib/db/schema.ts`:

```ts
// Cross-device session-grant correlation for fresh sign-up only (AC-13/
// AC-14 — see design doc §2). Deliberately excluded from the auth-cleanup
// abandoned-account safeguard's notExists() list — like `session`/
// `account`/`verification`, this is auth *mechanism*, not user-owned data,
// so its presence must never block deletion of an abandoned account (see
// doc-comment above `user` and auth-cleanup.ts).
export const signupAttempts = pgTable("signup_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  attemptId: text("attempt_id").notNull().unique(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

`user` table gains one nullable, `returned: false` column,
`signup_attempt_id text` (mirrors `additionalFields` above; always null
outside the brief window between insert and the `create.after` hook
running).

Cleanup: extend `runAuthCleanup()` (`src/lib/auth/auth-cleanup.ts`) with a
**third sweep**, alongside the existing expired-`verification`-row delete
and the abandoned-account delete:
```ts
await db.delete(signupAttempts).where(
  or(lt(signupAttempts.expiresAt, sql`now()`), isNotNull(signupAttempts.consumedAt)),
);
```
Unconditional (like the `verification` sweep — not gated behind
`AUTH_CLEANUP_DELETE_ENABLED`, since these rows carry no user-identifying
value once expired/consumed, same reasoning as expired verification
tokens). No new cron mechanism — same route
(`src/app/api/cron/auth-cleanup/route.ts`), same daily trigger.
`onDelete: "cascade"` on `userId` also means abandoned-account deletion
cascades this table automatically, same as `session`/`account`.

## 3. Open Question 2 (AC-9/AC-11) — same-browser live sync — RESOLVED

**Primitive**: a dedicated, app-owned `BroadcastChannel("folio-auth")`
(native Web API, not better-auth's internal shim — see §1's rejection
note), carrying `{type: "email-verified", correlationId: string}`.

**Unifying trick**: the *same* `callbackURL` mechanism used for cross-device
(§2) also carries the correlation id for the same-browser case, and — unlike
the cross-device table — this id does **not** need server-side persistence,
because `BroadcastChannel` delivery is purely a same-browser, client-side
concern:

- Fresh sign-up (AC-9): `callbackURL: "/verify-email?attemptId=" +
  signupAttemptId` (same id as §2). `/verify-email/page.tsx` reads
  `attemptId` from `useSearchParams()` on mount and posts `{type:
  "email-verified", correlationId: attemptId}` on the channel, then the
  original sign-up tab (which already knows its own `signupAttemptId` and is
  listening) matches and redirects — this fires *before* the cross-device
  poll loop would otherwise notice, so same-tab/same-browser cases resolve
  near-instantly rather than waiting out a 3s poll tick.
- Blocked sign-in / resend (AC-11): no server-side table needed at all,
  since this path is out of cross-device scope (§2.3). The client mints a
  client-only, ephemeral `verifyWatchId = crypto.randomUUID()` when it
  first renders the wait state, passes it the same way —
  `authClient.sendVerificationEmail({email, callbackURL:
  "/verify-email?attemptId=" + verifyWatchId})` — and listens on the same
  channel/type, matching on `correlationId === verifyWatchId`. Purely a
  same-browser convenience; a second device has no way to complete this
  flow live (falls back to "sign in again" once verified, which will now
  succeed per AC-7/AC-8).
- Both call sites therefore share one `BroadcastChannel` message contract
  and one listener implementation in `auth-card.tsx` — the *only*
  difference is which id populates `correlationId` and whether a
  server-side row backs it.
- Channel cleanup: `channel.close()` on unmount / on successful match, to
  avoid leaking listeners across tab-open sessions.

## 4. Open Question 3 (waiting-state UI location) — RESOLVED

Keep the "waiting" state **inline** inside `auth-card.tsx` (a new render
branch, not a new route) — this mirrors the existing non-dedicated
forgot-password "sent" confirmation pattern (§6.3 of the 2026-08-05 design
doc), since nothing external drives this state; it's purely
"we're waiting for an event that might happen in this tab or another one."

Add **one new dedicated route**, `src/app/verify-email/page.tsx` — this
mirrors `src/app/reset-password/page.tsx`'s existing precedent (a page whose
entire purpose is to be the query-param-driven landing target of an
emailed, token-bearing link) — handling:
- Success (no `error` param): session cookie is already set (§1,
  `autoSignInAfterVerification`) — broadcast the `email-verified` message
  (§3), then redirect to `/` client-side (covers AC-10's same-tab
  auto-sign-in, and covers a click that happens in a *third*, fresh tab that
  has no listener at all — it just proceeds directly).
- `error=TOKEN_EXPIRED` (AC-16) / `error=INVALID_TOKEN` (AC-19) / no token
  at all: same generic "link expired or already used" copy/pattern as
  `reset-password/page.tsx`'s `invalidToken` branch — reused verbatim
  (`mapAuthErrorMessage`-style copy, "Back to sign in" CTA), not a bespoke
  new message.
- `error=USER_NOT_FOUND` (AC-18): same generic branch — no distinct copy,
  since distinguishing it would leak account-existence information the AC
  doc's anti-enumeration posture (§0/AC-4/AC-14) is built around.
- Already-verified (AC-17): falls into the plain success path above
  (better-auth's own idempotent redirect, §1) — no special-casing needed.

## 5. Open Question 4 (`unverifiedNudge` fate) — RESOLVED

Delete `unverifiedNudge` state and its render branch entirely — its
precondition (`data?.user?.emailVerified === false` after a *successful*
sign-in) can no longer occur once `requireEmailVerification: true` makes
sign-in hard-reject first (§1/AC-6/AC-7).

Replace with an `EMAIL_NOT_VERIFIED`/`FORBIDDEN` branch in `handleSignIn`'s
existing `signInError` handling, rendering the **same** wait-state UI
component introduced for §3/§4 (parameterized: shows a resend button instead
of "check your inbox for the link you just requested," since no email was
just sent) — this is a reuse of one component, not two divergent UIs, per
`software-architecture`'s modularity guidance.

Anti-enumeration copy: the sign-up's generic-duplicate response (§0/AC-4)
still needs its own message, since sign-up itself must not confirm/deny
account existence even before hitting sign-in. Recommend mirroring the
already-established forgot-password phrasing pattern (`auth-card.tsx:196`,
"If an account exists for that email, a reset link is on its way."):
**"If an account can be created for that email, we've sent a link to verify
it."** — paired with the same always-visible resend action. Flagged, per
the AC doc's own suggestion, for final wording sign-off in `code-reviewer`
(copy is not an architecture concern).

## 6. AC-6: `requireCurrentUser()` change

`src/lib/auth/server.ts`'s `getCurrentUser()` currently only checks
`session?.user?.email` truthiness — it never inspects `emailVerified`, so a
session created *before* this feature shipped (or one that slips through
some other path) would still pass. Add the check at this single choke point
(the only caller is `requireCurrentUser()`, called from
`src/app/(app)/layout.tsx` — confirmed, no `middleware.ts` exists in this
repo):

```ts
export async function getCurrentUser(): Promise<AppSessionUser | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.email) return null;
    if (session.user.emailVerified === false) return null; // AC-6
    return { id: session.user.id, email: session.user.email, name: session.user.name ?? undefined };
  } catch {
    return null;
  }
}
```

`requireCurrentUser()`'s existing `redirect("/sign-in")` on `null` already
does the right thing — an unverified, pre-existing session gets bounced to
the sign-in card, where the (now-hard-blocking) sign-in flow's
`EMAIL_NOT_VERIFIED` branch (§5) takes over and offers resend. No new route
or special "you must verify" interstitial needed — reuses the existing
redirect-to-sign-in convention.

## 7. File-by-file plan

| File | Change |
|---|---|
| `src/lib/auth/setup.ts` | `emailAndPassword.requireEmailVerification: true`; `emailVerification.autoSignInAfterVerification: true`; add `user.additionalFields.signupAttemptId`; add `databaseHooks.user.create.after`; register new `signupAttemptExchange` plugin in `plugins: [...]` (new array — none exists today). |
| `src/lib/auth/signup-attempt-plugin.ts` (new) | The better-auth plugin: `POST /signup-attempt/claim` endpoint + its `rateLimit` entry, per §2.2. Extracted to its own file so it's unit-testable independent of the full `betterAuth()` instance, matching the `auth-emails.ts` extraction precedent. |
| `src/lib/db/schema.ts` | New `signupAttempts` table (§2.4); new nullable `signup_attempt_id` column on `user`; doc-comment noting exclusion from the abandoned-account safeguard. |
| `src/lib/auth/auth-cleanup.ts` | Third sweep deleting expired/consumed `signupAttempts` rows (§2.4), folded into `runAuthCleanup()`'s existing return shape. |
| `src/lib/auth/server.ts` | `getCurrentUser()` gains the `emailVerified` check (§6). |
| `src/components/auth/auth-card.tsx` | Remove `unverifiedNudge`; add shared wait-state component/branch (post-signup, cross-device poll loop, `BroadcastChannel` listener); `handleSignIn`'s error branch grows an `EMAIL_NOT_VERIFIED`/`FORBIDDEN` case reusing it; `handleSignUp` generates `signupAttemptId`, passes it via `callbackURL`, stops doing the unconditional `window.location.href = "/"`; `handleResendVerification` generates `verifyWatchId`, passes it via `callbackURL` the same way. |
| `src/app/verify-email/page.tsx` (new) | Landing page for the emailed link — mirrors `src/app/reset-password/page.tsx`'s structure; reads `attemptId`/`error` query params, broadcasts, redirects (§4). |
| `docs/INDEX.md` | New entry (documentation-writer's job, not architect's — flagged for follow-up). |

## 8. Traceability (AC → design section)

| AC | Covered by |
|---|---|
| AC-1, AC-2 | §7 (`auth-card.tsx` wait-state replacing unconditional redirect) |
| AC-3 | Unchanged (`minPasswordLength`, already in place) |
| AC-4 | §0/§1 (`shouldReturnGenericDuplicateResponse`, config flip only) |
| AC-5 | Unchanged (rate limiting already covers `/sign-up*`) |
| AC-6 | §6 |
| AC-7, AC-8 | §5 |
| AC-9 | §3 (fresh-signup same-browser broadcast) |
| AC-10 | §1 (`autoSignInAfterVerification`, already-shipped behavior) + §4 (redirect on the new `/verify-email` page) |
| AC-11 | §3 (resend-path same-browser broadcast) |
| AC-12 | Unchanged (idempotent resend, already better-auth default) |
| AC-13, AC-14 | §2 |
| AC-15 | Rate limiting §2.2's `rateLimit` entry + existing `/send-verification-email` special rule |
| AC-16 | §4 (`TOKEN_EXPIRED` branch) |
| AC-17 | §1/§4 (idempotent success, no code change) |
| AC-18 | §4 (`USER_NOT_FOUND`, folded into generic branch) |
| AC-19 | §4 (`INVALID_TOKEN`, folded into generic branch) |

## 9. Build sequence for `developer` (TDD-style)

1. Schema migration: `signupAttempts` table + `user.signup_attempt_id`
   column (Drizzle migration; extend `tests/lib/db` fixtures if any exist).
2. `setup.ts` config flip (`requireEmailVerification: true`,
   `autoSignInAfterVerification: true`) — expect existing
   `tests/auth/setup.smoke.test.ts` to need updates; this is the
   highest-blast-radius single-line change, land it with its own focused
   test first.
3. `databaseHooks.user.create.after` (§2.2) — test: genuine sign-up creates
   exactly one `signupAttempts` row bound to the new user id and nulls the
   passthrough column; **duplicate sign-up creates zero rows** (this is the
   security-invariant test, §2.1 — must be explicit and named as such).
4. `signup-attempt-plugin.ts` (§2.2) — test all three response states
   (`pending` not-found, `pending` unverified, `granted`), one-time-use
   (second claim after `granted` returns `pending`, not a second session),
   and the rate-limit entry firing.
5. `auth-cleanup.ts` third sweep — test alongside existing
   `tests/api/cron/auth-cleanup*.test.ts` fixtures.
6. `server.ts`'s `getCurrentUser()` check (§6) — test both a verified and an
   unverified session against `requireCurrentUser()`.
7. `auth-card.tsx`: remove `unverifiedNudge`; add the shared wait-state
   component + `BroadcastChannel` listener + poll loop; wire
   `handleSignUp`/`handleResendVerification`'s `callbackURL` construction;
   wire `handleSignIn`'s `EMAIL_NOT_VERIFIED` branch. Existing
   `tests/components/auth/auth-card.test.ts` will need substantial updates —
   treat as the last, integration-shaped step once 1-6 are green.
8. `src/app/verify-email/page.tsx` (new) — test success/`TOKEN_EXPIRED`/
   `INVALID_TOKEN`/`USER_NOT_FOUND`/no-token branches, mirroring
   `reset-password/page.tsx`'s existing test coverage shape if one exists.
9. Full pre-push gate (`pnpm typecheck && pnpm lint && pnpm test && pnpm
   build`) before handoff to `code-reviewer`.

## 10. Deviations from the "no persistent connection" steer — none

No WebSocket/SSE/push infra introduced. Same-browser sync uses
`BroadcastChannel` (no network, in-process); cross-device uses short-interval
(3s), rate-limited HTTP polling, both explicitly requested as the fallback
mechanisms in the AC doc's own scope section. Nothing in this design needed a
persistent connection to work correctly — the one-time, low-frequency event
these ACs describe never had a technical requirement pointing that way.

## 11. GDPR/`gdpr-compliance` notes

- Data minimization (§47 BDSG): the `user.signup_attempt_id` passthrough
  column is nulled within the same request cycle it's used (§2.2); the
  durable `signupAttempts` row is deleted within 24h of expiry/consumption
  by the cron sweep (§2.4) — no long-lived copy of this correlation id
  exists anywhere.
- Least privilege (`software-architecture`): the new poll endpoint only
  ever reads by opaque `attemptId`, never by email — closing the
  enumeration/account-takeover vector at the data-access layer, not just in
  application logic (§2.1).
- No new PII field is introduced — `signupAttemptId`/`verifyWatchId` are
  both client-generated opaque UUIDs, not derived from or containing email/
  name/any identifying value.
