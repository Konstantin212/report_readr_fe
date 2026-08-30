# Public Landing Page at `/` (SEO issue #2) — Acceptance Criteria

Status: draft, ready for `architect`. Date: 2026-08-29.
Driving issue: `Konstantin212/report_readr_fe#2` — "SEO: serve a real public
landing page at `/` instead of 307-redirecting to `/sign-in`".

Related existing docs (read before designing):

- [Onboarding surfaces](../../onboarding-surfaces.md) — §1 makes
  `src/lib/onboarding/broker-instructions.ts` the **only** authoring site for
  broker export/connect instruction prose, and §5 bans copy that implies
  restricted access. The landing page inherits the broker list from
  `/sign-in`, so it becomes a new onboarding surface and inherits both rules.
  See AC-SEO6.
- [First-Run Onboarding Clarity — AC](2026-08-28-onboarding-clarity-ac.md) —
  AC-OC0.2 (single source of copy), AC-OC3.2–3.5 (the first-run dashboard
  branch, asserted by reading `src/app/(app)/page.tsx` **by path**) and
  AC-OC4.4 (no onboarding surface implies restricted access). Moving the
  dashboard file and adding a public copy surface both touch these.
- [Open Self-Service Sign-Up — AC](2026-08-05-open-signup-ac.md) —
  `AUTH_SIGNUP_MODE` defaults to `"open"`. The landing page is written for
  cold, unknown, unauthenticated traffic; that is only coherent because
  sign-up is open.
- [Email Verification Gate — AC](2026-08-06-email-verification-gate-ac.md) — a
  user can hold a valid session cookie and still be rejected by
  `requireCurrentUser()` (`getCurrentUser()` returns `null` when
  `emailVerified === false`, `src/lib/auth/server.ts:39-41`). AC-SEO2.5 says
  what happens to that user at `/`.
- [Role System & Admin Panel — AC](2026-08-08-admin-panel-ac.md) — AC-2.1's
  non-admin page guard is a bare `redirect("/")` in
  `src/lib/auth/require-admin.ts`, and `impersonate-button.tsx` pushes `/`.
  Both are "go to the dashboard" pointers and both move. See AC-SEO4.

## User story

As an anonymous visitor or a search-engine crawler arriving at
`https://ptfolio.net/`, I want the root URL to answer with real content about
what the product does, so that the page everyone links to is indexable and
worth ranking — instead of a 307 into a login form that says nothing.

As a signed-in user, I want `/` to still take me to my dashboard, so the
change costs me nothing.

## Scope

**In scope — exactly five items:**

1. A public, statically prerendered landing page at `/`
   (`src/app/(marketing)/page.tsx`), rendered as a Server Component.
2. The dashboard moves off `/` to `/dashboard`, and every in-app pointer at
   "the dashboard" moves with it.
3. `/sign-in` is reduced to a focused auth screen.
4. A signed-in visitor at `/` still ends up on the dashboard, by a mechanism
   that is a UX convenience and **not** an auth gate.
5. The landing page joins the set of surfaces governed by the onboarding-copy
   invariants.

**Out of scope — no AC is written for these, and no change to them may be
made as a side effect:**

- **`sitemap.xml`, `robots.txt`, `<meta>`/OpenGraph tags, JSON-LD structured
  data, and landing-page content expansion.** These are issues #4, #5, #6, #7
  and #9. This change only has to make a stable, indexable 200 exist for them
  to attach to. The one thing this AC does require is that nothing shipped
  here *blocks* indexing — see AC-SEO1.6.
- **Tax logic.** No change under `src/lib/tax`, the ledger, or any Anlage
  KAP / KAP-INV / SO code path (AC-SEO0.3).
- **Auth mechanics.** Sign-up modes, the email-verification gate, password
  reset, rate limiting and session lifetime are all unchanged. This change
  moves *destinations*, not *gates*.
- **The welcome tour, the `/upload` disclosure and the first-run card**
  themselves. Their content is untouched; only the dashboard's file path
  changes (AC-SEO3.4).
- **Visual redesign of the app chrome.** The topbar, nav and bottom nav
  change `href`s and `match` predicates only.

---

## AC-SEO0 — Cross-cutting

- **AC-SEO0.1 (the root URL is the product's front door)** Given any request
  to `/` with no cookies at all, when the response is inspected, then it is
  **200** with a text/html body containing the landing content — never a 3xx,
  never an error page. Verifiable with `curl -sSI https://ptfolio.net/` from
  a clean shell and with a fresh browser profile.
- **AC-SEO0.2 (no user-agent branching)** Given the mechanism that keeps
  signed-in users off `/`, when its implementation is reviewed, then it
  makes no decision based on `User-Agent`, IP, or any crawler heuristic.
  Crawlers get the landing page because they are cookieless, not because they
  were detected. Cloaking is a ranking penalty, not a feature.
- **AC-SEO0.3 (no tax surface touched)** Given this feature is implemented,
  when the diff is reviewed, then it contains no change under `src/lib/tax`,
  the ledger, or any Anlage KAP / KAP-INV / SO code path, and every existing
  golden fixture passes unchanged.
- **AC-SEO0.4 (no new analytics events)** Given the analytics catalogue
  ([AC](2026-08-07-analytics-events-ac.md)), when this feature ships, then no
  event name or property allow-list is added or changed. A landing-page
  conversion event is a separate decision, not a side effect of a route move.
- **AC-SEO0.5 (no regression for signed-in users)** Given a user with data,
  when they use the app after this change, then every screen, widget, upload
  flow and tax export behaves exactly as before; the only observable
  difference is that the dashboard's URL is `/dashboard` and `/` bounces
  there.

---

## Item 1 — The public landing page at `/`

Root cause being fixed: `src/app/(app)/layout.tsx:12` calls
`requireCurrentUser()`, which `redirect("/sign-in")`s when there is no
session, and the dashboard page lives inside that route group at `/`. There
is no marketing route at all, so the only publicly reachable page is the auth
screen.

- **AC-SEO1.1 (the route exists in its own group)** Given the App Router
  tree, when the landing page is added, then it lives at
  `src/app/(marketing)/page.tsx` in a route group that is **not** nested
  under `(app)`, so that no ancestor layout of the landing page calls
  `requireCurrentUser()` or any other session-reading helper.
- **AC-SEO1.2 (Server Component, no client boundary)** Given
  `src/app/(marketing)/page.tsx`, when it is inspected, then it carries no
  `"use client"` directive and uses no hooks, event handlers or browser APIs.
  Interactive affordances, if any are ever needed, must be pushed into a leaf
  component rather than made the page's boundary.
- **AC-SEO1.3 (no session read anywhere on the path)** Given the landing
  page and every layout above it, when the render path is traced, then it
  calls none of `headers()`, `cookies()`, `auth.api.getSession()`,
  `getCurrentUser()`, `requireCurrentUser()`, `getAppNavContext()`, or any
  database query. This is what makes AC-SEO2.1 possible; it is also the
  difference between "public page" and "page that happens to work logged
  out".
- **AC-SEO1.4 (content, not a shell)** Given an anonymous visitor loads `/`,
  when the page renders, then it contains, at minimum: a single `<h1>`
  stating what the product does; a prose paragraph naming the supported
  brokers (Freedom24, Interactive Brokers, Coinbase) and the German tax
  artefact produced (Anlage KAP / Anlage SO); three feature blocks; a "what
  you'll need" list; and a trust statement about data handling. These are the
  elements moved off `/sign-in` — the page must not ship as a logo plus a
  button.
- **AC-SEO1.5 (a clear route to sign-in)** Given the landing page renders,
  when a visitor looks for a way in, then at least one clearly labelled
  control links to `/sign-in`, it is a real `<Link>`/`<a href>` (crawlable,
  middle-clickable, not a JS-only `router.push`), and following it reaches a
  working sign-in screen.
- **AC-SEO1.6 (indexable by default)** Given the landing page ships, when the
  response and page metadata are inspected, then there is no `noindex` /
  `nofollow` in a `<meta name="robots">` tag or an `X-Robots-Tag` header, and
  no `Cache-Control: private`-style header that would defeat edge caching.
  Positive SEO metadata (title, description, canonical, OG, JSON-LD) is
  issue #5/#6's job; **not blocking indexing** is this issue's job.
- **AC-SEO1.7 (works with no JavaScript)** Given a client with JavaScript
  disabled, when it requests `/`, then the headline, the prose and the
  sign-in link are all present in the initial HTML. A crawler that does not
  execute scripts must still see the whole page.

---

## Item 2 — Static prerendering and the signed-in bounce, simultaneously

There is a real tension between "statically prerendered" (AC-SEO2.1) and
"authenticated users are not shown the marketing page at `/`" (AC-SEO2.3).
They are reconciled by keeping the *page* free of any session read and
putting the personalisation in a redirect **in front of** the cached
response, not inside it. The ACs below pin both halves so a future change
cannot quietly trade one for the other.

- **AC-SEO2.1 (prerendered at build time)** Given `pnpm build`, when the
  route summary is read, then `/` is listed as a static/prerendered route
  (`○`/`●`, not `ƒ`), and the prerender manifest contains an entry for `/`.
  In production, `curl -sSI https://ptfolio.net/` returns
  `x-nextjs-prerender: 1`.
  *Note for the architect:* the build-output assertion is the durable one;
  the header is a Vercel/Next implementation detail and should be treated as
  a production smoke check rather than the definition of the requirement.
- **AC-SEO2.2 (staticness is enforced, not conventional)** Given someone
  later adds a dynamic read to the landing page, when `pnpm build` runs, then
  the build **fails** rather than silently demoting `/` to a dynamic route.
  A page-level `export const dynamic = "force-static"` satisfies this; a
  comment does not. The app's single most important SEO surface must not be
  able to lose its cache entry by accident.
- **AC-SEO2.3 (signed-in visitors land on the dashboard)** Given a visitor
  whose request carries a session cookie, when they request `/`, then they
  are redirected to `/dashboard` and never see the marketing page.
- **AC-SEO2.4 (anonymous requests pay nothing)** Given a request to `/` with
  no session cookie, when it is handled, then it falls through to the
  prerendered response with no database query, no session validation and no
  dynamic rendering. The redirect mechanism's only anonymous-path cost is a
  cookie-header inspection.
- **AC-SEO2.5 (session cookie ≠ usable session)** Given a visitor holding a
  session cookie that `requireCurrentUser()` will reject — expired, revoked,
  forged, or belonging to an **unverified** account per the
  [email-verification gate](2026-08-06-email-verification-gate-ac.md) — when
  they request `/`, then they are redirected to `/dashboard`, where
  `(app)/layout.tsx`'s `requireCurrentUser()` rejects them and redirects to
  `/sign-in`. The end state is the sign-in screen (which already offers
  resend for the unverified case). They do **not** see the landing page, they
  do **not** see any dashboard content, and the two hops terminate — there is
  no `/` → `/dashboard` → `/` loop under any cookie state.
  *This is a deliberate cost of the cookie-presence heuristic — see Open
  question 1.*
- **AC-SEO2.6 (signing out restores the landing page)** Given a user signs
  out, when they then request `/`, then they see the landing page. This
  requires sign-out to clear the session cookie the redirect mechanism keys
  on; if it does not, AC-SEO2.5's bounce becomes permanent for that browser
  and this AC fails.

---

## Item 3 — The dashboard moves off `/`

- **AC-SEO3.1 (the dashboard has its own URL)** Given an authenticated,
  verified user, when they request `/dashboard`, then the dashboard renders
  exactly as it renders at `/` today — same widgets, same data, same
  first-run branch — inside the `(app)` layout with its topbar, bottom nav,
  tour host and impersonation banner.
- **AC-SEO3.2 (the auth gate is unchanged and still in the layout)** Given an
  anonymous visitor requests `/dashboard` (or any other `(app)` route), when
  the request is handled, then `requireCurrentUser()` in
  `src/app/(app)/layout.tsx` redirects to `/sign-in`, exactly as today. The
  gate's location, mechanism and behaviour do not change.
- **AC-SEO3.3 (no `(app)` route is left owning `/`)** Given the App Router
  tree after the change, when routes are enumerated, then no file under
  `src/app/(app)/` resolves to `/`, and there is exactly one `/` route in the
  whole app — the marketing one. Two route groups both claiming `/` is a
  build error, so this is enforced by `pnpm build` passing.
- **AC-SEO3.4 (the move is a documented rename, not a silent one)** Given
  `tests/onboarding/copy.test.ts` asserts AC-OC3.2–3.5 by reading
  `src/app/(app)/page.tsx` **by path**, when the dashboard file moves, then
  that test is updated to the new path in the same change and continues to
  assert the same things (early `return <FirstRunCard />`, the import-count
  and crypto-summary signal, `"No performance history yet."`, no
  `backfill`-class claim). A path change that makes an existing AC's test
  read a non-existent file — or, worse, silently pass — is a blocking defect.
- **AC-SEO3.5 (first-run behaviour survives the move)** Given a brand-new
  user with zero imports and no connected crypto account, when they reach the
  dashboard at its new URL, then `isFirstRun()` still holds, the first-run
  card still renders in place of the eight zero-valued widgets, and the
  welcome tour still auto-opens over it — AC-OC3.1–3.7 unchanged in
  substance.

---

## Item 4 — Every in-app pointer at "the dashboard" moves with it

This is the item most likely to be under-done. Every one of the call sites
below currently targets `/`; any left behind drops a signed-in user onto the
marketing page (or, once AC-SEO2.3 is in place, into an extra redirect hop).

- **AC-SEO4.1 (exhaustive pointer migration)** Given the change is complete,
  when every in-app "go to the dashboard" pointer is enumerated, then each of
  the following targets the dashboard's new URL rather than `/`:

  | Call site | What it is |
  |---|---|
  | `src/components/pulse/topbar.tsx` | the logo link |
  | `src/components/pulse/topbar-nav.tsx` | the "Dashboard" nav item |
  | `src/components/pulse/bottom-nav.tsx` | the "Dash" nav item |
  | `src/lib/auth/require-admin.ts` | `redirect("/")` for a non-admin hitting an admin page (admin-panel AC-2.1) |
  | `src/components/admin/impersonate-button.tsx` | `router.push("/")` after starting/stopping impersonation |
  | `src/components/auth/auth-card.tsx` | three post-auth `window.location.href = "/"` plus `callbackURL: "/"` for the OAuth round trip |
  | `src/app/verify-email/page.tsx` | `window.location.href = "/"` after successful verification |

- **AC-SEO4.2 (nav active-state follows)** Given the nav items in
  `topbar-nav.tsx` and `bottom-nav.tsx` whose `match` predicate is
  `p === "/"`, when the dashboard moves, then the predicate matches the new
  path and **only** the new path: on `/dashboard` the Dashboard item is
  active, and on `/positions`, `/upload`, `/tax/...`, `/settings` etc. it is
  not.
- **AC-SEO4.3 (post-authentication landing)** Given a user completes any of
  the auth paths — email+password sign-in, email+password sign-up followed by
  verification, OAuth (Google/GitHub), or clicking through the verification
  email — when the flow finishes, then they arrive at the dashboard with its
  data rendered, in one navigation, with no intermediate flash of the
  marketing page and no bounce through `/`.
- **AC-SEO4.4 (admin paths)** Given a signed-in non-admin requests an
  admin-panel page, when `requireAdminUser()` rejects them, then they land on
  the dashboard (admin-panel AC-2.1's "redirect away with no admin-panel
  content ever rendered" is preserved — only the destination changes).
  Likewise, given an admin starts or stops an impersonation session, when the
  page navigates, then it navigates to the dashboard.
- **AC-SEO4.5 (no orphaned `/` links inside the app)** Given the `(app)`
  route group after the change, when it is searched for links and
  navigations targeting `/`, then the only remaining ones are deliberate
  links to the *public landing page* (if any), each identifiable as such. A
  reviewer must be able to account for every surviving `"/"` target. A
  repo-wide search is the suggested verification, because a pointer added
  later cannot slip through a per-file test.
- **AC-SEO4.6 (the sign-in logo is a marketing link, on purpose)** Given the
  logo link on `/sign-in` points at `/`, when an anonymous visitor clicks it,
  then they reach the landing page. This one is correct as `/` and must not
  be swept up by AC-SEO4.1 — it is the "back to the marketing page" affordance,
  not a dashboard pointer.

---

## Item 5 — `/sign-in` becomes a focused auth screen

- **AC-SEO5.1 (marketing copy removed)** Given `src/app/sign-in/page.tsx`,
  when it renders after this change, then the hero, the three feature cards
  and the broker list are gone; what remains is the logo, a single orienting
  sentence, and `<AuthModalTrigger />`.
- **AC-SEO5.2 (no duplicated prose across two URLs)** Given the moved copy,
  when the codebase is searched for any distinctive sentence from the hero,
  the feature cards or the broker list, then it appears on the landing page
  only and not on `/sign-in`. Two URLs carrying the same marketing text split
  the ranking signal and give us two places to keep in sync.
- **AC-SEO5.3 (auth behaviour unchanged)** Given `/sign-in` after the
  reduction, when a user signs in or signs up, then provider availability
  (`getEnabledAuthProviders()`), sign-up mode (`getSignupMode()`), the
  verification hard-reject, the resend affordance and the rate limits all
  behave exactly as before. This item removes copy; it must not touch a
  single auth code path.
- **AC-SEO5.4 (still directly reachable)** Given a visitor navigates
  straight to `/sign-in` — from a bookmark, an email link, or a redirect out
  of `(app)` — when the request is handled, then the page renders with a 200
  and no redirect to `/`. The landing page is an additional entry point, not
  a mandatory one.

---

## Item 6 — The landing page is an onboarding surface

The landing page inherits the broker list from `/sign-in`, and it is now the
**first** copy any user reads. Both onboarding-copy invariants follow it
there.

- **AC-SEO6.1 (no restricted-access claim)** Given the landing page, when
  its copy is reviewed, then it makes no claim that access is limited to a
  known group — no "friends-only", "invite-only", "by invitation", "closed
  beta"/"private beta", "waitlist", "request access"/"early access". This is
  AC-OC4.4 applied to a new surface, and it matters more here than anywhere
  else: this is a public page, and `AUTH_SIGNUP_MODE` defaults to `"open"`.
  Verification: `tests/onboarding/copy.test.ts`'s `ONBOARDING_SURFACES` set
  is extended to include `src/app/(marketing)/page.tsx`.
- **AC-SEO6.2 (no second authoring site for broker instructions)** Given
  onboarding-surfaces §1 makes `src/lib/onboarding/broker-instructions.ts`
  the only authoring site for broker export/connect instruction prose, when
  the landing page's "what you'll need" list is reviewed, then it does not
  re-author that prose: no numbered export steps, no restatement of the Flex
  Query warning, no Coinbase key-creation walkthrough, no "open the `.json`
  in a text editor" sentence. A one-line-per-broker *orientation* summary
  ("Freedom24 → Statements → All-Time JSON") is permitted; a second set of
  *instructions* is not. See Open question 2 — the architect must state
  explicitly which side of that line the shipped list sits on and why.
- **AC-SEO6.3 (the summary cannot contradict the instructions)** Given the
  landing page names an artefact (a file format, an export name, a field
  label), when it is compared with `BROKER_INSTRUCTIONS`, then they agree.
  If the shared module later changes which export the app accepts, a stale
  landing page becomes a public, indexed, wrong instruction — worse than an
  in-app one. The architect must say how divergence is caught (a test
  asserting the shared module's own strings, or importing the labels from it
  rather than retyping them).
- **AC-SEO6.4 (claims about data handling are verified, not assumed)** Given
  the landing page makes any statement about what happens to user data
  (e.g. "parsed locally", "no data leaves your browser before you sign in",
  "only normalized events are stored"), when it ships, then each statement is
  checked against the
  [data-lifecycle doc](2026-08-05-open-signup-data-lifecycle.md) and the
  actual ingest path, and any statement that cannot be substantiated is
  removed rather than softened. A public marketing page is the highest-stakes
  place in the app to make an unverifiable data-protection claim.
- **AC-SEO6.5 (no claims about scale or company status)** Given the landing
  page, when its copy is reviewed, then it asserts nothing about user counts,
  company status, funding, security certification or guarantees — the same
  constraint AC-OC4.2 places on the welcome card.

---

## Item 7 — The redirect mechanism is not an auth gate

Adding `src/middleware.ts` (the repo has none today) is a security-relevant
decision. `CLAUDE.md` calls out CVE-2025-29927, in which a crafted
`x-middleware-subrequest` header causes Next.js to skip middleware entirely.
Anything a middleware "protects" is therefore protected only as well as the
framework's own bypass surface. These ACs bound what the mechanism is allowed
to be.

- **AC-SEO7.1 (the real gate does not move)** Given this change, when the
  auth architecture is reviewed, then `requireCurrentUser()` inside
  `src/app/(app)/layout.tsx` remains the single enforced choke point for
  every authenticated route, and `requireAdminUser()` / `requireAdminApi()`
  remain the choke points for admin surfaces. No authorization decision is
  relocated into middleware, and no route's protection becomes *dependent on*
  middleware running.
- **AC-SEO7.2 (bypassing the mechanism grants nothing)** Given an attacker
  who can cause the middleware not to run at all, when they exercise every
  route, then the worst outcome is that a signed-in user sees the marketing
  page at `/` instead of being bounced to `/dashboard`. No page renders
  authenticated data, no API returns data, and no admin surface opens. This
  is the property that makes AC-SEO7.4's cookie-presence shortcut acceptable.
- **AC-SEO7.3 (narrowest possible matcher)** Given the middleware config,
  when it is inspected, then it matches `/` and nothing else. `/sign-in`,
  `/verify-email`, `/reset-password`, every `(app)` route, every `/api/*`
  route and every static asset must not enter middleware. Widening the
  matcher later is a security-reviewable change, not a refactor.
- **AC-SEO7.4 (cookie presence only — no validation, no I/O)** Given the
  middleware runs, when its logic is reviewed, then it inspects only whether
  a session cookie is *present* (e.g. better-auth's `getSessionCookie`), and
  it does not validate the token's signature, query the database, read
  `emailVerified`, check `role`, or call `auth.api.getSession()`. Doing any
  of those would (a) put an auth decision in a skippable layer and (b) add
  per-request I/O to the app's most-cached URL. A forged cookie buys exactly
  one thing: a redirect into the real gate.
- **AC-SEO7.5 (the reasoning is recorded in the file)** Given
  `src/middleware.ts` exists, when a future reader opens it, then a comment
  states that it is a UX redirect and not an auth gate, names
  `requireCurrentUser()` as the real gate, and explains why the matcher is
  narrow. This is the kind of file that grows an `if (isAdmin)` in six
  months; the comment is the guard rail.
- **AC-SEO7.6 (framework security floor)** Given middleware is introduced,
  when `package.json` is checked, then the `next` dependency range excludes
  every version affected by CVE-2025-29927 (floor `>=15.2.3`), and the
  installed version in the lockfile satisfies it. *Verified 2026-08-29: the
  manifest already declares `">=15.2.3 <16.0.0"`, so this AC is a
  regression fence rather than a change request — confirm the lockfile
  matches.*
- **AC-SEO7.7 (existing security headers still apply to `/`)** Given the
  `headers()` config in `next.config.ts` applies to `/:path*`, when `/` is
  requested, then HSTS, `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy` and `Permissions-Policy` are all present on the landing
  page response, unchanged. Adding a middleware must not strip them.

---

## Item 8 — Build, types and the pre-push gate

- **AC-SEO8.1 (`typedRoutes` compiles)** Given `typedRoutes: true` in
  `next.config.ts`, when `pnpm typecheck` runs, then it passes: every moved
  `href` is a valid route literal, and no `as Route`/`as any` cast was added
  to silence a broken link. The typed-route system is precisely the tool that
  catches a missed pointer from Item 4 — suppressing it defeats the change's
  main safety net.
- **AC-SEO8.2 (the full pre-push contract passes)** Given the change is
  ready, when `pnpm typecheck && pnpm lint && pnpm test && pnpm build` runs,
  then all four pass. No test is skipped, `.skip`-ed or deleted to
  accommodate the route move; tests that assert on the dashboard's path are
  *updated* (AC-SEO3.4).
- **AC-SEO8.3 (existing test suites still assert the same behaviour)** Given
  `tests/onboarding/copy.test.ts`, `tests/onboarding/broker-instructions.test.ts`,
  `tests/onboarding/first-run.test.ts`, `tests/auth/copy.test.ts` and the
  admin route-guard coverage test, when they run after the change, then each
  still asserts the behaviour its original AC describes. A test whose only
  post-change assertion is that a file exists at a new path has lost its
  meaning.
- **AC-SEO8.4 (verified against a real deployment)** Given the change is
  deployed, when `curl -sSI https://ptfolio.net/` is run with no cookies,
  then the response is `200`, carries `x-nextjs-prerender: 1`, and the body
  contains the `<h1>`. Given the same URL is loaded in a browser with a valid
  session, then the browser ends on the dashboard. Both checks are run before
  the issue is closed — the local build output is necessary but not
  sufficient, because the redirect mechanism only exists at the edge.

---

## Traceability

| AC | Surface | Suggested verification |
|---|---|---|
| AC-SEO0.1 | `/` | `curl -sSI` with no cookies → `200` |
| AC-SEO0.2 | redirect mechanism | source review: no `User-Agent` read |
| AC-SEO0.3 | whole diff | tax golden fixtures pass unchanged |
| AC-SEO0.4 | `src/lib/analytics-events.ts` | diff is empty for that file |
| AC-SEO1.1–1.3 | `src/app/(marketing)/page.tsx` + ancestors | source test: no `"use client"`, no `headers`/`cookies`/`getSession` on the path |
| AC-SEO1.4–1.5 | landing page | source test for the `<h1>`, broker names, `href="/sign-in"` |
| AC-SEO1.6 | landing page | no `noindex` in metadata or `X-Robots-Tag` |
| AC-SEO1.7 | landing page | JS-disabled load, or assert content in the SSR'd HTML |
| AC-SEO2.1–2.2 | `pnpm build` | route summary marks `/` static; `force-static` present |
| AC-SEO2.3–2.6 | redirect mechanism | e2e: cookie present → `/dashboard`; no cookie → `200`; unverified → ends at `/sign-in`; sign out → landing page returns |
| AC-SEO3.1–3.3 | `/dashboard` | e2e signed-in render; anonymous `/dashboard` → `/sign-in`; build has one `/` route |
| AC-SEO3.4–3.5 | `tests/onboarding/copy.test.ts` | test reads the new path and still asserts AC-OC3.2–3.5 |
| AC-SEO4.1–4.2 | the seven call sites | repo-wide search for `"/"` targets; nav `match` unit test |
| AC-SEO4.3 | auth flows | e2e per path: password, OAuth, verification email |
| AC-SEO4.4 | admin panel | non-admin → dashboard; impersonate → dashboard |
| AC-SEO4.5–4.6 | `(app)` group + `/sign-in` | reviewer accounts for every surviving `/` target |
| AC-SEO5.1–5.2 | `src/app/sign-in/page.tsx` | source test: hero/feature/broker strings absent here, present on landing page, one authoring site each |
| AC-SEO5.3–5.4 | `/sign-in` | existing auth tests unchanged and passing; direct `GET /sign-in` → `200` |
| AC-SEO6.1 | landing page | `ONBOARDING_SURFACES` in `tests/onboarding/copy.test.ts` includes the marketing page |
| AC-SEO6.2–6.3 | landing page vs. `broker-instructions.ts` | `rg` for each fenced phrase returns only the copy module; labels agree |
| AC-SEO6.4–6.5 | landing page | copy review against the data-lifecycle doc |
| AC-SEO7.1–7.5 | `src/middleware.ts` | source review + test asserting the matcher is `"/"` and no `getSession`/db import |
| AC-SEO7.6 | `package.json` + lockfile | installed `next` >= 15.2.3 |
| AC-SEO7.7 | `/` | `curl -sSI` shows the five headers |
| AC-SEO8.1–8.3 | CI / pre-push hook | all four commands pass, no skipped tests |
| AC-SEO8.4 | production | post-deploy curl + signed-in browser check |

---

## Open questions for the architect

These are genuine ambiguities. They are flagged rather than resolved here.

1. **A stale session cookie costs a visitor the landing page.** AC-SEO2.5's
   consequence is that anyone whose session expired — but whose browser still
   holds the cookie — is bounced `/` → `/dashboard` → `/sign-in` and never
   sees the marketing page from the root URL. There is no way to distinguish
   them without validating the session, which AC-SEO7.4 forbids and which
   would also destroy the prerender (AC-SEO2.1). The three options are:
   (a) accept it, on the grounds that a returning user wanting the
   marketing page is a rare case and sign-out self-heals it (AC-SEO2.6);
   (b) make the bounce client-side inside the landing page, keeping `/`
   statically cached but flashing marketing content at signed-in users;
   (c) drop the bounce entirely and render the landing page for everyone,
   with a "Go to dashboard" link. The issue's own AC ("Authenticated users
   are not shown the marketing page at `/`") rules out (c) as written. **A
   product decision is needed on (a) vs (b);** this AC is written assuming
   (a).
2. **Is the landing page's broker list an instruction surface?** AC-SEO6.2
   draws a line between an orientation summary and a second set of
   instructions, but the line is a judgement call, and the existing
   `tests/onboarding/copy.test.ts` fences specific *phrases* rather than the
   concept — so a reworded restatement passes the test while still violating
   onboarding-surfaces §1 in spirit. The architect should either (i) rule
   that the landing list is marketing, exempt it explicitly, and say what
   keeps it honest (AC-SEO6.3), or (ii) rule that it is an onboarding surface
   and source its labels from `broker-instructions.ts`. Leaving it
   unaddressed means the next person to edit either side has no rule to
   follow.
3. **Should `/dashboard` be explicitly `noindex`?** It is unreachable
   anonymously (it 307s to `/sign-in`), so it cannot be indexed with content
   today. Whether to add an explicit robots directive anyway is arguably
   issue #5's (metadata) call, not this one's. Named here so the handoff is
   explicit rather than forgotten.
4. **Exact landing-page wording.** Within AC-SEO1.4, AC-SEO6.1, AC-SEO6.4 and
   AC-SEO6.5, the sentences are the author's choice. This AC fixes the
   semantics and the prohibitions, not the prose. Issues #7/#9 own content
   expansion.
5. **Whether the dashboard's new path is exactly `/dashboard`.** The issue
   says "e.g. `/dashboard`". This AC assumes `/dashboard` throughout because
   every pointer in Item 4 has to name *something*, and no alternative was
   proposed. If the architect prefers another path, it is a find-and-replace
   across Items 3 and 4 — but note that the path becomes a stable URL people
   bookmark, so changing it later is a second migration.
