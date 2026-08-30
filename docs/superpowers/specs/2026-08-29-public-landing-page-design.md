# Public Landing Page at `/` (SEO issue #2) — Design

Status: **ratifies the shipped implementation on `feat/public-landing-page`,
with two required amendments (§7).** Date: 2026-08-29.

Driving issue: `Konstantin212/report_readr_fe#2`.
Acceptance criteria: [AC](2026-08-29-public-landing-page-ac.md).

Inputs read: `docs/INDEX.md`, the AC above, [onboarding
surfaces](../../onboarding-surfaces.md), [first-run onboarding
clarity](2026-08-28-onboarding-clarity-ac.md), [open
self-service sign-up](2026-08-05-open-signup-ac.md), [email-verification
gate](2026-08-06-email-verification-gate-ac.md), [admin
panel](2026-08-08-admin-panel-ac.md), [data
lifecycle](2026-08-05-open-signup-data-lifecycle.md), and the working tree.

## 0. What this document is

The implementation existed before this design was written. This document is
therefore a **review-and-ratify** design, not a forward-looking one: it states
the reasoning the shipped structure is entitled to, and it names the two
places where the shipped code is wrong and must change before the
`code-reviewer` gate.

Everything in §1–§6 is a ratification with reasoning. §7 is the change list.
§8 answers the AC's five open questions. §9 records deferrals.

---

## 1. The central tension and the mechanism that resolves it

`/` must simultaneously be:

- a **build-time constant** — one HTML document, identical for every
  requester, served from cache, so a crawler gets a fast 200 (AC-SEO2.1); and
- **personalised** — a signed-in visitor must not see it (AC-SEO2.3).

These are irreconcilable *inside* one render. The only way to have both is to
keep the personalisation strictly **in front of** the cached response and
never inside it. That gives exactly three candidate mechanisms:

| Mechanism | Prerender survives? | Cost |
|---|---|---|
| Session read in `(marketing)/page.tsx` | **No** — `cookies()` forces the route dynamic, killing AC-SEO2.1 outright | fatal |
| Client-side bounce inside the landing page | Yes | signed-in users see a flash of marketing; needs JS, so it fails for the `noscript` path the page is otherwise proud of (AC-SEO1.7); an unnecessary client boundary on the app's one static page |
| **Edge middleware on `/` only** | Yes | one edge-function invocation per request to `/`, no I/O |

Middleware wins because it is the only layer in the App Router that can
inspect a request and answer before the static output is selected, without
touching the render tree at all. The landing page stays a pure Server
Component with zero dynamic APIs, and the `force-static` export turns that
into a build-time guarantee rather than a convention: if someone later
introduces a dynamic read on that page, `pnpm build` fails instead of
silently demoting the app's most valuable SEO surface to `ƒ`.

**Ratified as shipped.** `src/app/(marketing)/page.tsx` +
`src/middleware.ts` are the correct shape.

### 1.1 Module boundary

```
request to "/"
   │
   ├─ src/middleware.ts ......... UX only. Cookie *presence*. No I/O.
   │      cookie present → 307 /dashboard
   │      otherwise      → next()
   │
   └─ src/app/(marketing)/page.tsx ... static. No session. No DB. No client boundary.
          └─ src/app/layout.tsx ....... static. Fonts + <Analytics />. No session.

request to "/dashboard" (and every other (app) route)
   │
   └─ src/app/(app)/layout.tsx
          └─ requireCurrentUser() ..... THE auth gate. Unchanged.
```

The interface between the two halves is one bit — "does a cookie named like a
better-auth session token exist" — and it flows in one direction only. The
landing page does not know the middleware exists; the middleware does not know
what the landing page contains. That is the narrowest interface available and
it is why widening the middleware later is a security-reviewable change rather
than a refactor.

### 1.2 Why `(marketing)` is a route group and not a `marketing/` segment

A route group `(marketing)` keeps the URL at `/` while giving the page an
ancestor chain that excludes `(app)/layout.tsx`. This is load-bearing for
AC-SEO1.3: the group has **no `layout.tsx` of its own**, so the landing page's
entire ancestor chain is `src/app/layout.tsx` — which reads no session, calls
no dynamic API, and does no database work. Verified in the tree.

**Design rule:** `src/app/(marketing)/` must not acquire a `layout.tsx` that
reads a session, and must never be nested under `(app)`. The existing
structural test (`tests/routing/public-landing.test.ts:67-72`) asserts the
page itself; the group's emptiness is preserved by the fact that adding such a
layout would immediately break the `force-static` build.

---

## 2. Security posture: the middleware is not a gate

`CLAUDE.md` names CVE-2025-29927 — a crafted `x-middleware-subrequest` header
causes Next.js to skip middleware entirely. The correct architectural response
is not "patch and then trust middleware"; it is **never to put an
authorization decision behind a layer whose defining property is that it can
be skipped.**

This design therefore treats the middleware as *unreliable by construction*
and asks one question: what does an attacker gain by making it not run?

**Answer: a signed-in user sees the marketing page at `/` instead of being
bounced.** That is the entire blast radius. No page renders authenticated
data, no API returns anything, no admin surface opens — because
`requireCurrentUser()` in `src/app/(app)/layout.tsx` is still the only thing
that authenticates, and it runs inside the React render on the server, where
there is no skip mechanism. This is what makes the cookie-presence shortcut
acceptable (AC-SEO7.2, AC-SEO7.4): a forged cookie buys exactly one thing, a
redirect into the real gate.

**Ratified.** The shipped `src/middleware.ts` calls only
`getSessionCookie(request)` — header parsing, no signature verification, no
`auth.api.getSession()`, no database, no `emailVerified`, no `role` — and its
doc-comment states all of this (AC-SEO7.5). `tests/routing/public-landing.test.ts:176-180`
enforces the absence of `auth.api` / `getSession(` / `@/lib/db` /
`@/lib/auth/setup` in the file.

### 2.1 Security floor

Middleware being introduced makes the framework version a **design
constraint**, not an incidental dependency. `package.json` declares
`"next": ">=15.2.3 <16.0.0"` and the lockfile resolves `next@15.5.18`
(`pnpm-lock.yaml:2946`), so the CVE-2025-29927 floor is satisfied today.

**Design rule (regression fence):** the lower bound of the `next` range may
not be relaxed below `15.2.3` while `src/middleware.ts` exists. Restated here
because a dependency bump is exactly the kind of change that would not
otherwise be read against this design.

### 2.2 Security headers

`next.config.ts:26-42` applies HSTS, `X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy` and `Permissions-Policy` to `/:path*`.
The shipped middleware returns `NextResponse.next()` on the anonymous path,
which does not construct a fresh response and therefore does not strip
`headers()` output (AC-SEO7.7). No change needed. Confirm against the
deployment as AC-SEO8.4 requires — this is the one property that only exists
at the edge.

### 2.3 The matcher

`matcher: "/"` is correct and should stay a single exact path, not an array
and not a regex.

- An array is the right shape only when there is more than one entry; adding
  the brackets pre-emptively invites a second entry.
- A negative-lookahead regex (the common `"/((?!api|_next|...).*)"`) is the
  *wrong* default here. It matches everything by default and excludes by
  exception, so the failure mode of a mistake is "middleware runs on a route
  nobody intended". This design wants the opposite failure mode.

`tests/routing/public-landing.test.ts:172-174` pins the value with
`expect(middlewareConfig.matcher).toBe("/")`. Changing it fails a test, which
is the intended friction.

### 2.4 The cost of middleware existing at all

The repo had none. Introducing one is not free, and the costs are accepted
knowingly:

1. **An edge function now ships on every deploy** and is invoked on every
   request to `/`, including crawler traffic. The invocation does one cookie
   header parse. The HTML still comes from the static output; middleware sits
   in front of the cache lookup, it does not replace it. Cost is real but
   bounded to one URL by §2.3.
2. **`src/middleware.ts` is a magnet.** It is the file that grows an
   `if (isAdmin)` in six months. Three things guard it: the doc-comment
   naming `requireCurrentUser()` as the real gate, the matcher test, and the
   forbidden-import test. Ratified as sufficient.
3. **Edge-runtime constraint.** Anything imported by `middleware.ts` must be
   edge-safe. `getSessionCookie` from `better-auth/cookies` is pure header
   parsing and satisfies this; `@/lib/auth/setup` (Drizzle + Neon) does not
   and must never be imported here. Already enforced by the test in §2.

### 2.5 An undocumented coupling worth recording

`getSessionCookie(request)` resolves the cookie **name** from better-auth's
defaults (`better-auth.session_token`, `__Secure-`-prefixed under HTTPS).
`src/lib/auth/setup.ts` currently sets no `cookiePrefix` and no
`advanced.cookies` override, so the default holds — verified.

**Design rule:** if `setup.ts` ever customises the session cookie name or
prefix, `src/middleware.ts` breaks *silently* (every signed-in visitor starts
seeing the landing page; nothing errors). The two must be changed together.
The existing tests at `tests/routing/public-landing.test.ts:152-165` pin both
the bare and `__Secure-` names, so a rename fails there — but the failure will
read as a middleware bug, so this paragraph is the pointer back to the cause.

---

## 3. The dashboard move

`git mv src/app/(app)/page.tsx src/app/(app)/dashboard/page.tsx` with
unchanged content is the right migration: the page keeps its position inside
`(app)`, so `requireCurrentUser()` in the group layout still wraps it, and the
first-run branch (`isFirstRun()` → early `return <FirstRunCard />`), the
memoised `getImportCount`, the tour host and the impersonation banner all move
with it untouched (AC-SEO3.1, AC-SEO3.2, AC-SEO3.5).

**Ratified.** `tests/onboarding/copy.test.ts:194` and `:362` were repointed at
`src/app/(app)/dashboard/page.tsx` and still assert the same four things
AC-OC3.2–3.5 required (early return, import-count + crypto signal,
`"No performance history yet."`, no `backfill`-class claim). That satisfies
AC-SEO3.4 — the test reads a real file and its assertions still mean what they
meant.

### 3.1 The typed-routes safety net is weaker than the AC assumes

AC-SEO8.1 treats `typedRoutes: true` as the mechanism that catches a missed
pointer from Item 4. It is not, in the two files that matter most.
`topbar-nav.tsx:27` and `bottom-nav.tsx:28` both render
`href={n.href as never}` — a pre-existing repo-wide idiom (twelve sites under
`src/components/pulse/`) for feeding a computed route literal to `<Link>`.
A stale `"/"` left in either `NAV` array would have compiled cleanly.

This is not a defect introduced by this change and this design does not
propose removing the casts — that is a separate refactor with no bearing on
issue #2. It is recorded because it changes *which* artefact is load-bearing:

**The real safety net for AC-SEO4.1/4.5 is the exhaustive source scan at
`tests/routing/public-landing.test.ts:92-108`, not the type system.** That
test walks every `.ts`/`.tsx` under `src/`, strips comments, and fails on any
surviving `window.location.href = "/"`, `router.push("/"`, `redirect("/")`,
`callbackURL: "/"` or `href: "/",`. It is exhaustive rather than per-file, so
a pointer added in six months cannot slip through by not being named. Verified
against the tree: the only remaining `href="/"` in `src/` is
`src/app/sign-in/page.tsx:32`, the logo — which is AC-SEO4.6's deliberate
"back to the marketing page" affordance and is correctly excluded from the
scan's patterns (it matches `href="/"`, not `href: "/",`).

**Design rule:** that test is the register of dashboard pointers. A new
"go to the dashboard" navigation must be expressible as one of its five
patterns, or the test must gain a sixth.

### 3.2 Nav active-state predicate

`p === "/"` → `p.startsWith("/dashboard")` in both navs. Ratified. It matches
the convention every other item in both `NAV` arrays already uses
(`startsWith("/positions")`, `startsWith("/tax")`, …), and no other route in
the app shares the `/dashboard` prefix, so AC-SEO4.2's "and **only** the new
path" holds. Using `===` here would have been the inconsistent choice and
would break the moment `/dashboard` grows a child segment.

### 3.3 `src/app/(app)/loading.tsx` — still correct, now misnamed

The file remains at the group root with no sibling `page.tsx`. This is
**behaviourally unchanged and correct**: in the App Router a `loading.tsx`
wraps the segment's `children` in a Suspense boundary and applies to every
nested segment that does not declare its own. It needs no sibling page. Before
the move it was already the fallback for `/dashboard`'s new neighbours
(`/crypto`, `/upload`, `/settings`, `/admin`) as well as for `/`; after the
move it is the fallback for exactly the same set, `/dashboard` now reaching it
by inheritance rather than by co-location. `positions`, `performance`,
`dividends` and both `tax/[year]` levels keep their own.

**Ruling: leave it where it is.** Moving it to
`src/app/(app)/dashboard/loading.tsx` would *narrow* the boundary and remove
the fallback from four routes that currently have one — a behaviour regression
inside a change whose AC-SEO0.5 forbids exactly that. The only real defect is
cosmetic: the exported component is named `DashboardLoading` while serving as
a group-wide fallback, and its skeleton is dashboard-shaped. Non-blocking;
renaming the export to `AppLoading` is optional cleanup for the `developer`
and changes nothing observable.

---

## 4. `/sign-in` reduction

`src/app/sign-in/page.tsx` retains `getEnabledAuthProviders()`,
`getSignupMode()` and `<AuthModalTrigger />` — the three things AC-SEO5.3
requires to be untouched — and drops the hero, feature cards and broker list.
No auth code path was modified. Ratified.

The page remains directly reachable with a 200 (AC-SEO5.4): the middleware
matcher excludes it by construction (§2.3), so a bookmark, an email link and
`requireCurrentUser()`'s own `redirect("/sign-in")` all land without a bounce.
This is not incidental — it is the reason the matcher must stay exactly `/`.
Widening it to a prefix or a negative-lookahead regex would put `/sign-in`
inside the middleware and create the `/` → `/dashboard` → `/sign-in` → `/`
cycle AC-SEO2.5 forbids.

---

## 5. Redirect chain termination

Provable from the matcher rather than by testing cases:

| Cookie state | Chain | Terminal |
|---|---|---|
| absent | `/` → 200 static | landing page |
| present, valid, verified | `/` → 307 `/dashboard` → 200 | dashboard |
| present, expired / revoked / forged / unverified | `/` → 307 `/dashboard` → `requireCurrentUser()` → 307 `/sign-in` → 200 | sign-in |

The chain cannot loop because **only `/` enters the middleware**. `/dashboard`
and `/sign-in` are unmatched, so no hop can return to `/`. Maximum length is
two redirects, from `/`, under every cookie state. AC-SEO2.5 satisfied.

AC-SEO2.6 (signing out restores the landing page) holds:
`src/components/pulse/user-menu.tsx:42-50` calls `authClient.signOut()` —
which clears the session cookie server-side — before `router.replace("/sign-in")`.
The next request to `/` is cookieless and falls through to the static page.

---

## 6. Onboarding-surface obligations

The landing page is now the **first** copy any user reads, and unlike every
existing onboarding surface it is public and indexable. Both invariants from
[onboarding-surfaces](../../onboarding-surfaces.md) follow it there, and the
stakes are higher on each: a wrong instruction here is a wrong instruction
that Google will serve.

- **AC-SEO6.1 (no restricted-access claim)** — satisfied and enforced.
  `tests/onboarding/copy.test.ts:392-402` adds
  `src/app/(marketing)/page.tsx` to `ONBOARDING_SURFACES`, so all six
  restricted-access patterns are scanned against it. Ratified as shipped.
- **AC-SEO6.5 (no scale/company claims)** — satisfied by inspection; the page
  asserts nothing about users, funding or certification.
- **AC-SEO6.2/6.3 (broker list)** and **AC-SEO6.4 (data-handling claims)** —
  **not satisfied.** See §7.

---

## 7. Required amendments

Two changes are required before the `code-reviewer` gate. Both are in
`src/app/(marketing)/page.tsx`; neither touches the middleware, the route
move, or any auth path.

### 7.1 The "What you'll need" list must source its labels from `broker-instructions.ts`

**AC-SEO6.2/6.3. Blocking.**

The shipped list (`src/app/(marketing)/page.tsx:97-110`) reads:

```
Freedom24 → Statements → Download All-Time JSON
Interactive Brokers → Reports → Activity → Annual Activity CSV
Coinbase → API Key (CDP Portfolio) — optional
```

Compare `BROKER_INSTRUCTIONS` (`src/lib/onboarding/broker-instructions.ts:70-143`):

| | Landing page says | Copy module says |
|---|---|---|
| IBKR nav path | `Reports → Activity` | `Client Portal → Performance & Reports → Statements → Activity Statement` |
| IBKR artefact | `Annual Activity CSV` | period `Annual`, format `CSV`, sections `all` |
| Freedom24 artefact | `All-Time JSON` | period `All time`, format `JSON` |
| Coinbase | `API Key (CDP Portfolio)` | `Coinbase Developer Platform → Portfolios → API keys`, permissions `view only` |

The IBKR line names a menu path that does not exist in IBKR's Client Portal.
It is not a compression of the real path — `Reports → Activity` is a different
navigation from `Performance & Reports → Statements → Activity Statement`.
This is precisely the failure AC-SEO6.3 was written to prevent, and it has
already happened, in the first commit, on a page intended to be indexed.

The fairness point stands: this copy is pre-existing, moved verbatim from
`/sign-in`. But it was tolerable on a page nobody could reach without already
being on the way in, and it is not tolerable on a public one. "It was already
there" is an argument against blaming the change; it is not an argument for
keeping it.

**Ruling: option (b) — the list stays, in the one-line shape AC-SEO6.2
explicitly permits, but its strings are authored in
`src/lib/onboarding/broker-instructions.ts` and imported.**

Option (a), "exempt it as marketing with a divergence guard", was considered
and rejected — not on taste, but because it is **structurally impossible to
implement correctly.** Fixing the IBKR path requires the landing page to
contain the strings `"Performance &"` and `"Activity Statement"`, and
`tests/onboarding/copy.test.ts:266-286` fences both to the copy module as
their sole authoring site. Under option (a) the landing page can only stay
green by staying wrong. Option (c), deleting the list, loses real
above-the-fold value ("can I even use this?") that the AC's Item 1 asks for by
name (AC-SEO1.4 lists "a 'what you'll need' list" as required content).

**Interface.** Add to `src/lib/onboarding/broker-instructions.ts`, alongside
`BROKER_INSTRUCTIONS`, keeping the module's existing character — plain
TypeScript, no JSX, no Tailwind, chrome belongs to the consumer:

```ts
/**
 * One-line orientation summary per broker for the public landing page.
 * NOT instructions — no steps, no warnings, no walkthrough. Every string in
 * `path` and `artifact` must also appear in that broker's full
 * InstructionSection, which is what keeps a public, indexed page from
 * outliving a change to the real instructions.
 */
export type BrokerSummary = {
  id: InstructionBrokerId;
  /** Display name, e.g. "Interactive Brokers". */
  label: string;
  /** Menu path, in the broker's own words, rendered joined by " → ". */
  path: readonly string[];
  /** What you end up with, rendered emphasised. */
  artifact: readonly string[];
  /** Free qualifier, e.g. "optional". Not fenced against the section. */
  note?: string;
};

export const BROKER_SUMMARIES: readonly BrokerSummary[] = [ /* … */ ];
```

with, for IBKR, `path: ["Performance & Reports", "Statements"]` and
`artifact: ["Activity Statement", "Annual", "CSV"]`; for Freedom24,
`path: ["Statements"]` and `artifact: ["All time", "JSON"]`; for Coinbase,
`path: ["Portfolios", "API keys"]`, `artifact: ["view only"]`,
`note: "optional"`. Exact display wording is the author's, subject only to the
derivation rule below.

The landing page imports `BROKER_SUMMARIES`, maps `id` → brand colour class
(`text-brand-ibkr` etc.), and renders `path.join(" → ")` plus the emphasised
`artifact`. This is the same split `welcome-tour.tsx` already uses: the module
carries `badge: "IBKR"` and never a class name. No new pattern is introduced.

**Enforcement — this is what AC-SEO6.3 asks the architect to name.** Extend
`tests/onboarding/broker-instructions.test.ts` (a real-import unit test, not a
source grep) with:

> for each `BrokerSummary`, every string in `path` and in `artifact` appears
> verbatim in `spansToText()` of the corresponding section's `lead` + `steps`
> + `notes`.

That test fails the moment the full instructions rename a menu, change a
format, or switch which export the app accepts — which is exactly the
divergence that would otherwise turn into a public, indexed, wrong
instruction. It is a real assertion over imported values, not a phrase fence,
so it does not have `copy.test.ts`'s weakness of passing on a reworded
restatement.

Secondary fence, in `tests/routing/public-landing.test.ts`: assert the landing
page imports `BROKER_SUMMARIES` and contains no ` → ` arrow-chain literal of
its own, so the list cannot be re-inlined later.

Note the consequence for `tests/routing/public-landing.test.ts:128-137`, which
currently asserts `"All-Time JSON"` and `"What you"` appear in the marketing
page and not on `/sign-in`. `"All-Time JSON"` disappears; the assertion should
move to a string that survives (`"What you"` does).

**Ruling recorded for the future editor:** the landing page is an *orientation
surface*, not an instruction surface. It may render one derived line per
broker. It may not author steps, warnings, the Flex Query note, the Coinbase
key walkthrough, or the "open the `.json` in a text editor" sentence. Those
belong to `broker-instructions.ts` and are rendered only by the three
consumers listed in onboarding-surfaces §1.

### 7.2 The trust line overstates two claims

**AC-SEO6.4. Blocking.**

`src/app/(marketing)/page.tsx:118-121` reads:

> No data leaves your browser before you sign in. Statements are parsed
> locally; only normalized events are stored.

Checked against the actual ingest path and the [data-lifecycle
doc](2026-08-05-open-signup-data-lifecycle.md):

- **"Statements are parsed locally" — TRUE.**
  `src/components/pulse/upload-dropzone.tsx:44` calls
  `parseStatementInWorker` (`src/lib/brokers/client.ts`), which runs the
  parser in a Web Worker in the browser. The raw statement file is never
  uploaded. This claim is substantiated and should stay.
- **"No data leaves your browser before you sign in" — FALSE on this very
  page.** `src/app/layout.tsx:19` mounts `<Analytics />` (`@vercel/analytics`)
  in the root layout, unconditionally, for every route including
  `(marketing)`. An anonymous visitor reading that sentence has already sent a
  pageview beacon to Vercel. Vercel Web Analytics being cookieless and
  IP-hashing makes the *processing* defensible; it does not make the
  *sentence* true. AC-SEO6.4 requires an unsubstantiable claim to be removed
  rather than softened.
- **"only normalized events are stored" — OVERSTATED.** The POST body at
  `upload-dropzone.tsx:57-70` also carries `fileName`, a SHA-256 `fileHash`,
  `accountNumber`, `baseCurrency` and the statement date range, all of which
  are persisted. Those are the right things to store (the hash is the
  duplicate-import fingerprint) and none of them is the raw statement — but
  "only … events" is not what happens.

**Ruling:** replace the paragraph with a claim bounded by what the code
does. Semantics required, prose left to the author (Q4):

- it may say the statement file is parsed in the browser and never uploaded;
- it may say what is sent instead (normalised events plus the account and file
  metadata needed to file and de-duplicate);
- it may **not** assert that nothing leaves the browser before sign-in while
  `<Analytics />` is in the root layout;
- it may **not** assert that events are the only thing stored.

**Enforcement:** add to `tests/routing/public-landing.test.ts` a fence that
the marketing page does not contain the phrase `leaves your browser`, with a
comment pointing at `src/app/layout.tsx`'s `<Analytics />` as the reason. A
blanket "no data-handling claims" test is not possible without a DOM and would
be the wrong shape anyway; fencing the specific unsubstantiable sentence is
the honest, narrow assertion. Gating this on a real review of new copy remains
the `code-reviewer`'s job — the test only stops this exact regression.

*Not in scope for this change, flagged for `documentation-writer` and the
`/privacy` page owner:* the root layout's unconditional `<Analytics />` means
the public landing page performs analytics processing on visitors who have not
signed up and have seen no privacy notice. The data-lifecycle doc already
flags the shipped privacy page as unreviewed. Making `/` public increases the
population this touches. It is a pre-existing condition, not something this
change introduces, and rewiring analytics consent is well outside issue #2 —
but the change does make it more visible, so it is recorded rather than
silently inherited.

---

## 8. Rulings on the AC's five open questions

### Q1 — a stale session cookie costs a visitor the landing page

**Ruling: accept (option a), as the AC assumed. No amendment.**

Who actually hits this. The better-auth cookie's own `Max-Age` tracks the
session lifetime, so an *expired* session normally takes its cookie with it —
the browser stops sending it and the visitor gets the landing page. The
residual population is narrower than "anyone whose session expired": it is
visitors whose session was revoked **server-side while the cookie survived** —
principally password reset (which this app deliberately revokes other sessions
on, per [open sign-up](2026-08-05-open-signup-ac.md)), admin-triggered
deletion, and accounts blocked by the email-verification gate.

What it costs them. `/` → `/dashboard` → `/sign-in`, terminating in two hops
(§5). They land on the sign-in screen, which is where each of those three
populations needs to be: the reset user signs in with the new password, the
unverified user gets the resend affordance, the deleted user gets an accurate
rejection. Nobody is stranded, nothing is broken, and the only thing lost is
the marketing page — which none of them is in the market for.

Why not (b), the client-side bounce. It would flash marketing at every
signed-in user, require JS on the one page whose value proposition is working
without it (AC-SEO1.7), and put a client boundary on the app's only static
page — all to serve a marketing page to a population that already has an
account. The trade is backwards.

Why not (c). Ruled out by the issue's own AC.

One consequence to record rather than fix: a visitor in this state who lands
on `/sign-in` and clicks the logo (`href="/"`, AC-SEO4.6) goes `/` →
`/dashboard` → `/sign-in` again. It terminates every time, it is
user-initiated rather than automatic, and the fix — clearing the cookie when
`requireCurrentUser()` rejects it — is auth mechanics, which the AC's scope
section places out of bounds for this change. **Deferred, not forgotten:** a
follow-up may make session rejection clear the stale cookie, which would
resolve this and improve the reset/verification flows generally.

### Q2 — is the landing page's broker list an instruction surface?

**Ruling: it is an *orientation* surface, permitted to exist in one-line form,
but its labels must be sourced from `broker-instructions.ts` — option (b).**
Option (a) is not merely riskier; it cannot produce a correct IBKR path
without breaking an existing test fence. Full reasoning, interface and
enforcing test in §7.1.

### Q3 — should `/dashboard` carry an explicit `noindex`?

**Ruling: defer to issue #5 (metadata), explicitly, and it is recorded here so
it is not lost.**

Reasoning: `/dashboard` cannot be indexed *with content* — an anonymous
request is redirected to `/sign-in` by `requireCurrentUser()` before anything
renders. Nor is there a crawl path to it: the landing page and `/sign-in` link
only to each other and to auth, and every `/dashboard` link lives behind the
gate. The residual risk is a URL-only listing if someone links the path
externally, which is cosmetic.

More importantly, it is the *wrong shape* to decide here. A `robots` directive
on `(app)/layout.tsx` would apply to every authenticated route, not just the
dashboard — that is an app-wide metadata policy, which is issue #5's subject
matter, and deciding it inside a route-move change would set the policy by
side effect. Issue #5 should rule on `noindex` for the whole `(app)` group at
once, not on `/dashboard` alone.

**Handoff to issue #5, written down so the deferral is a decision and not an
omission:**
1. Rule on `robots: { index: false }` for the `(app)` group as a whole.
2. `src/app/layout.tsx:9-12` currently supplies the *only* metadata in the app
   (`title: "folio."`, a description naming IBKR + Freedom Finance) and it
   applies to `/` by inheritance. `/` therefore already has a title and
   description; #5 adds canonical, OG and JSON-LD on top.
3. Whatever #5 adds must not regress AC-SEO1.6 — no `noindex`/`nofollow` and
   no `Cache-Control: private` on `/`.

### Q4 — landing-page wording latitude

**Ruling: prose is the author's; the prohibitions are these, and two of them
are currently violated.**

Binding on `src/app/(marketing)/page.tsx`:

1. No claim that access is restricted to a known group (AC-SEO6.1) — six
   patterns enforced by `tests/onboarding/copy.test.ts:408-419`. **Currently
   satisfied.**
2. No claim about user counts, scale, company status, funding, certification
   or guarantees (AC-SEO6.5). **Currently satisfied.**
3. No re-authored broker instructions; one derived orientation line per broker
   (AC-SEO6.2/6.3). **Currently violated — §7.1.**
4. No data-handling claim that the code does not substantiate (AC-SEO6.4).
   **Currently violated — §7.2.**
5. No claim about a background job the app does not run — the same fence
   AC-OC3.5 places on the dashboard. The landing page must not imply that
   history, prices or tax figures appear on their own after sign-up.
6. Tax-adjacent copy must not state a rate, a threshold, an Anlage line number
   or a legal conclusion. Naming the artefacts ("Anlage KAP", "Anlage SO") and
   the paragraphs ("§22", "§23") is orientation and is fine; the shipped
   `"365-day cliff"` and `"€256 Freigrenze"` sit at the edge of this and
   should be read by `tax-advisor` before push. Everything under `src/lib/tax`
   is verified against BMF/ELSTER per `CLAUDE.md`; a public page quoting a
   threshold inherits that standard without inheriting the verification.

Within those six, sentence-level wording, tone and structure are the author's,
and issues #7/#9 own content expansion.

### Q5 — is `/dashboard` the right path?

**Ruling: ratify `/dashboard`. No change.**

It matches the label both navs already use ("Dashboard" / "Dash"), so the URL
and the UI agree. It collides with no existing route and shares a prefix with
none, which is what makes `startsWith("/dashboard")` unambiguous (§3.2). It is
the conventional choice, so it is the one a user guesses and a support answer
can state without ambiguity. And the path is now a bookmark: the AC is right
that changing it later is a second migration plus a redirect the app would
carry indefinitely. There is no candidate — `/app`, `/home`, `/overview` —
that is better on any axis, so the cost of a change is unpaid for.

---

## 9. Enforcement map

What holds each decision in place, so a reviewer can check the guard rather
than re-derive the reasoning:

| Decision | Enforced by |
|---|---|
| `/` is static, no session on the path | `force-static` + `pnpm build`; `tests/routing/public-landing.test.ts:67-82` |
| `(app)` no longer owns `/` | `public-landing.test.ts:61-65`; two groups claiming `/` is a build error |
| Middleware is not an auth gate | `public-landing.test.ts:176-180` (forbidden imports); doc-comment in `src/middleware.ts` |
| Matcher stays `/` | `public-landing.test.ts:172-174` |
| Cookie-name coupling to `setup.ts` | `public-landing.test.ts:152-165` (bare + `__Secure-`); §2.5 |
| CVE-2025-29927 floor | `package.json` range + lockfile; §2.1 is the fence |
| Every dashboard pointer moved | `public-landing.test.ts:92-108` (exhaustive scan) — **not** typed routes, see §3.1 |
| Nav active state | `public-landing.test.ts:110-115` |
| `/sign-in` carries no marketing prose | `public-landing.test.ts:125-138` (adjust per §7.1) |
| First-run branch survived the move | `tests/onboarding/copy.test.ts:193-230` |
| No restricted-access claim on `/` | `tests/onboarding/copy.test.ts:392-419` |
| Broker labels agree with the instructions | **to add** — `tests/onboarding/broker-instructions.test.ts`, §7.1 |
| No unsubstantiable data claim | **to add** — `tests/routing/public-landing.test.ts`, §7.2 |
| Prerender + headers in production | AC-SEO8.4 post-deploy curl; only verifiable at the edge |

---

## 10. Handoffs

**To `developer`:** §7.1 and §7.2, plus their two new tests. Nothing else in
this design requires a code change. Do not touch the middleware, the route
move, the pointer migration or any auth path while making them.

**To `tester`:** the two new assertions in §7.1/§7.2; confirm
`tests/routing/public-landing.test.ts:128-137` still asserts something real
after `"All-Time JSON"` is removed from the page. AC-SEO8.4's post-deploy
check (cookieless `curl -sSI` → 200 + `x-nextjs-prerender: 1` + `<h1>`, and a
signed-in browser ending on `/dashboard`) cannot be run locally and is a
release step, not a test.

**To `tax-advisor`:** one question only — whether the landing page may state
`"365-day cliff"` and `"€256 Freigrenze"` as shipped, per §8/Q4 rule 6. No
tax code path is touched by this change (AC-SEO0.3 holds: the diff contains
nothing under `src/lib/tax` or the ledger).

**To `documentation-writer`:** `docs/onboarding-surfaces.md` §1 needs the
orientation/instruction distinction ruled in §7.1 — that the module now also
owns `BROKER_SUMMARIES`, that the landing page is a fourth consumer, and that
it is an orientation surface with a narrower licence than the other three.
Also §7.2's analytics note, if the `/privacy` page is being revisited.

**To issue #5:** the three-item metadata handoff in §8/Q3.
