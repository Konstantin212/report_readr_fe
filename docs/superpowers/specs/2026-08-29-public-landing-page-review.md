# Public Landing Page at `/` (SEO issue #2) — Code Review

Reviewer: `code-reviewer`. Date: 2026-08-29. Branch: `feat/public-landing-page`
(nothing committed — reviewed as working tree: `git status` + `git diff HEAD` +
untracked files).

**Gate decision: DO NOT PUSH. One blocking finding (B1).** Everything else below
is non-blocking. Re-review scope after the fix is one file
(`src/lib/onboarding/broker-instructions.ts`) plus a green `pnpm test`.

Skills applied: `code-review`, `nextjs-security`, `nextjs-best-practices`,
`react-best-practices`.

---

## What I verified myself

I did not take the hand-off's verification claims on trust. Re-run here:

- `pnpm typecheck` — exit 0.
- `npx vitest run tests/routing/public-landing.test.ts tests/onboarding` —
  147 passed, 0 failed.
- `better-auth`'s `getSessionCookie` read from
  `node_modules/better-auth/dist/cookies/index.mjs:169-177` — confirmed it is a
  pure `cookie` header parse (`parseCookies` → map lookup), with **no** secret,
  no signature check and no I/O. The design's core security premise holds at the
  library level, not just in the doc-comment.
- `package.json:37` declares `"next": ">=15.2.3 <16.0.0"`; `pnpm-lock.yaml:2946`
  resolves `next@15.5.18`. AC-SEO7.6 satisfied.
- Exhaustive grep of `src/` for every root-path pointer form (not just the five
  the test scans). Result below in N3.
- Trust-line copy checked statement-by-statement against
  `src/components/pulse/upload-dropzone.tsx:44` and `:53-70` and
  `src/lib/imports/ingest.ts` (snapshot persistence).
- Tax copy checked against `src/lib/tax/anlage-so.ts:27-35` and
  `src/lib/tax/elster-fields.ts`.
- Broker summaries checked term-by-term against
  `BROKER_INSTRUCTIONS` (`src/lib/onboarding/broker-instructions.ts:69-143`).
- Tailwind tokens (`brand-ibkr`/`brand-freedom`/`brand-coinbase`, `borderHard`,
  `amber`, `pink`, `dim`) confirmed at `tailwind.config.ts:13-28`, content glob
  `./src/**/*.{ts,tsx}` covers the new `(marketing)` directory.

I did not re-run `pnpm build` or the Playwright spec; the reported evidence
(`○ /` static, `x-nextjs-prerender: 1`, 13 passed) is specific enough to be
falsifiable and is consistent with everything I read.

---

## BLOCKING

### B1 — the Coinbase orientation line names a menu path in the wrong product

`src/lib/onboarding/broker-instructions.ts:180-186` (the `coinbase` entry of
`BROKER_SUMMARIES`), rendered by `src/app/(marketing)/page.tsx:100-102`.

**What's wrong.** The summary is:

```ts
{ id: "coinbase", label: "Coinbase", path: ["Portfolios", "API keys"],
  artifact: ["view only"], note: "optional" }
```

which `BrokerLine` renders as:

> → **Coinbase**  Portfolios → API keys  **view only** — optional

The full instruction it is supposed to derive from
(`broker-instructions.ts:113-121`) reads:

> **Coinbase Developer Platform** → **Portfolios** → **API keys** → **Create**

Dropping the leading segment moves the path from one product to another.
`Portfolios → API keys` is a Coinbase Developer Platform menu; it does not exist
in the Coinbase retail app that a reader who sees the word "Coinbase" will open.

**Why it matters.** This is the same defect class as the IBKR
`Reports → Activity` path that design §7.1 declared blocking — a menu path that
does not exist where the page sends the reader — on the same public, indexable
page, and it is a *regression* against the copy it replaced: `/sign-in`
previously said `API Key (CDP Portfolio)`, which at least named CDP. AC-SEO6.3
exists precisely to stop the landing page from carrying a broker path a reader
cannot follow.

Note this squarely: **design §7.1 prescribed this exact shape**
(`path: ["Portfolios", "API keys"]`). This is a design-level miss, not a
developer deviation — the developer implemented what was specified. I am
flagging it because the brief invited review of the design and because the
consequence is identical to the defect §7.1 was written to correct.

**The fix** (one line):

```ts
path: ["Coinbase Developer Platform", "Portfolios", "API keys"],
```

I checked this against every fence before proposing it:

- `tests/onboarding/broker-instructions.test.ts` (new derivation block) — passes:
  `"Coinbase Developer Platform"` appears verbatim in
  `BROKER_INSTRUCTIONS.coinbase.steps[0]`.
- `tests/onboarding/copy.test.ts`'s `"Coinbase Developer Platform"` fence —
  passes: it only bans re-authoring in files under `src/components/` or
  `src/app/`, and this is the copy module itself (`src/lib/onboarding/`).
- `tests/routing/public-landing.test.ts:157-165` — passes: it fences the
  *marketing page source*, which imports rather than contains the strings.
- `e2e/public-landing.spec.ts` Coinbase assertions (`toContainText("Portfolios")`
  / `"API keys"` / `"view only"`) — all still hold.

For contrast, IBKR's elision of `Client Portal` is **not** a defect: Client
Portal is IBKR's only web UI and the obvious front door for someone told
"Interactive Brokers". CDP is a genuinely separate product. That distinction is
the reason B1 is a judgment call rather than something a test caught, which
leads directly to N1.

---

## NON-BLOCKING

### N1 — the new derivation test cannot catch B1's class

`tests/onboarding/broker-instructions.test.ts`, the
`"every path segment appears verbatim in the full instructions"` case.

It asserts each `path` segment appears *somewhere* in the section's flattened
text. It never checks order, contiguity, or completeness — so a summary can drop
the leading segment of a menu path (exactly what happened), or reverse two
segments, and stay green. The block's own doc-comment claims "every word the
summary shows has to be a word the full instructions already say", which is
true and is precisely the weaker property than "the summary is a path a reader
can follow".

Since design §9 names this test as *the* enforcement for AC-SEO6.3, it should at
least assert ordering:

```ts
for (let i = 0; i < summary.path.length - 1; i++) {
  expect(text.indexOf(summary.path[i])).toBeLessThan(text.indexOf(summary.path[i + 1]));
}
```

Completeness (was a leading segment dropped?) can't be asserted generically
without failing IBKR for the legitimate `Client Portal` elision, so that half
stays a review judgment. Worth saying so in the comment rather than implying the
test covers it.

### N2 — the pointer scan is narrower than "exhaustive"

`tests/routing/public-landing.test.ts:98-104` matches five literal patterns.
It misses `router.replace("/")`, `redirect("/" as Route)` (the pattern is
anchored on `("/")` including the closing paren), and JSX `<Link href="/">`.

The last omission is *correct* — `src/app/sign-in/page.tsx:32` needs it for
AC-SEO4.6 — but it means a `<Link href="/">Dashboard</Link>` added later slips
through silently. Typed routes can't catch it either: both navs cast with
`as never` (`topbar-nav.tsx:27`, `bottom-nav.tsx:28`), which I confirmed in the
source. Design §3.1 acknowledges the cast problem and then calls this scan "the
real safety net", which overstates it.

Minimum fix: add `/router\.replace\("\/"/` to the pattern list. The `<Link>`
gap is better handled by narrowing the exclusion (allow `href="/"` only in
`src/app/sign-in/page.tsx`) than by dropping the check.

Today's tree is clean either way — my own broader grep found exactly one
remaining root pointer in `src/`, the sign-in logo at
`src/app/sign-in/page.tsx:32`, which is required and is covered by an e2e test
that clicks it and asserts the landing `<h1>`.

### N3 — auth-flow completeness: verified correct

No finding; recording the check so it isn't repeated. All seven pointers land
where they should, and the two that were *not* moved were correctly left alone:

| Site | Now | Correct? |
|---|---|---|
| `auth-card.tsx:205` (cross-tab BroadcastChannel) | `/dashboard` | yes |
| `auth-card.tsx:232` (background session retry) | `/dashboard` | yes |
| `auth-card.tsx:253` (OAuth `callbackURL`) | `/dashboard` | yes |
| `auth-card.tsx:285` (post-sign-in) | `/dashboard` | yes |
| `verify-email/page.tsx:68` | `/dashboard` | yes |
| `require-admin.ts:62` (non-admin rejection) | `/dashboard` | yes |
| `impersonate-button.tsx:25` | `/dashboard` | yes |
| `topbar.tsx:17` (in-app logo) | `/dashboard` | yes |
| `topbar-nav.tsx:12` / `bottom-nav.tsx:11` | `/dashboard` + `startsWith` | yes |
| `sign-in/page.tsx:32` (marketing logo) | `/` | yes — AC-SEO4.6 |
| `user-menu.tsx:46` (post-sign-out) | `/sign-in`, unchanged | yes — AC-SEO2.6 |
| `impersonation-banner.tsx:23`, `delete-user-button.tsx:28` | `/admin`, unchanged | yes |

The two logos now diverge deliberately (in-app → `/dashboard`, auth screen →
`/`). That is right and both are tested.

`p.startsWith("/dashboard")` is unambiguous: `src/app/(app)/` contains admin,
crypto, dashboard, dividends, performance, positions, settings, tax, upload —
no other route shares the prefix.

### N4 — `nextjs-security`: middleware posture is sound; two nits

The middleware is what the design says it is, verified against the code and the
library rather than the doc-comment:

- **Nothing new is reachable.** `src/middleware.ts` can only *remove* `/` from
  cookie holders and let anonymous requests through to a page that used to be a
  redirect. `/dashboard` sits inside `(app)`, and
  `src/app/(app)/layout.tsx:12` still `await requireCurrentUser()` — unchanged
  in this diff.
- **A forged or replayed cookie buys exactly one redirect.** Confirmed at the
  library level (see "What I verified myself") and end-to-end: the e2e spec
  drives the whole chain with the literally bogus value `fake.value` and lands
  on `/sign-in`.
- **`matcher: "/"` is genuinely narrow.** A bare string matcher is an exact
  pathname match with no prefix semantics, pinned by
  `public-landing.test.ts:299-301`. `/sign-in` therefore stays outside the
  middleware, which is what makes the two-hop chain non-looping.
- **CVE-2025-29927 is not in play** — `next@15.5.18`, above the `>=15.2.3`
  floor. Separately: `CLAUDE.md` §5 still says "this repo currently pins
  `^15.1.0`". That is stale and should be corrected, since it invites a future
  reviewer to raise a resolved issue.
- **Security headers survive.** `next.config.ts:26-42` applies to `/:path*`,
  and `NextResponse.next()` does not construct a fresh response, so nothing is
  stripped.

Two nits:

1. **AC-SEO7.7 is asserted nowhere.** The AC's verification table leaves it to a
   manual post-deploy `curl -sSI`, but `e2e/public-landing.spec.ts` already
   fetches `/` with `maxRedirects: 0` — three lines would turn it into a
   regression fence. Recommended; the headers block is exactly the kind of
   config a future change could silently narrow.
2. `src/middleware.ts:28` uses `new URL("/dashboard", request.url)`. Not an open
   redirect (the path is hardcoded; only the origin comes from the request, and
   that is not cross-origin controllable). But `request.nextUrl.clone()` is the
   Next.js idiom and is robust to proxies and a future `basePath`. One-line
   preference, not a defect.

### N5 — content correctness: verified, with one note on what the tests do and don't hold

**Trust paragraph** (`src/app/(marketing)/page.tsx:111-116`) — checked clause by
clause against the ingest path:

- "parsed in your browser and never uploaded" — true, `upload-dropzone.tsx:44`
  `parseStatementInWorker`.
- "the normalized events and the position snapshot, holdings and closing prices
  included" — true and, importantly, discloses `snapshotQuotes`
  (`upload-dropzone.tsx:69` → `ingest.ts` `quoteCache`), which the earlier
  round omitted.
- "plus the file name, a checksum and the account details needed to recognize a
  duplicate import" — matches `fileName`, `fileHash`, `account{…}`.
- "Client-side parsing keeps the document off our servers; it does not mean your
  portfolio is hidden from them" — this clause is what makes the paragraph pass
  AC-SEO6.4. It is the honest one.

No blanket "nothing leaves your browser" claim survives, so `<Analytics />` at
`src/app/layout.tsx:19` no longer contradicts the page. `broker` and `taxYear`
are also POSTed and aren't enumerated, but both are plainly covered by "the data
read out of it". Not a finding.

**Tax copy** — checked against the code it describes:

- "shows each bucket against its own Freigrenze" carries no number. Correct:
  `anlage-so.ts:27` `FREIGRENZE_22_EUR = 256` (§22 Nr. 3) and `:33-35`
  `freigrenze23For()` → 1000 (≥2024) / 600. The earlier €256-on-a-§23-sentence
  conflation is gone.
- "tracks the one-year holding period" matches § 23 Abs. 1 S. 1 Nr. 2's
  "nicht mehr als ein Jahr" rather than a day count.
- "Separates §22 Nr. 3 staking income from §23 private-sale gains" matches
  `anlage-so.ts`'s own header ("legally SEPARATE … Do NOT sum into one
  threshold").
- "Anlage KAP / KAP-INV Zeile values computed for you, with the Anlage SO
  figures alongside" is correctly bounded: `elster-fields.ts` defines `KAP_*`
  and `KAP_INV_*` keys only, no SO field key, so the page promises Zeile numbers
  only where they exist.
- "Per-event ECB FX, FIFO lot matching, evidence CSV" — substantiated by
  `src/lib/ledger/fx.ts` and `src/lib/tax/export-csv.ts`.
- No restricted-access claim, no scale/company/certification claim
  (AC-SEO6.1 / 6.5), and `copy.test.ts:393-402` now scans the marketing page for
  the six restricted-access patterns.

**Would the tests catch a regression, or do they just pass today?** Mostly the
former, and honestly so:

- The data-handling block's *positive* assertions are the strong half —
  `/position snapshot/i` and `/holdings/i` are required, so a rewrite that
  quietly drops the snapshot disclosure fails. That is a real fence, not a
  tautology.
- Its *negative* fences are phrase-specific and walkable: `"Nothing is
  transmitted until you sign in"` matches neither `/leaves your browser/i` nor
  `/no data (is )?(sent|leaves|transmitted)/i`. Design §7.2 says as much and
  assigns the residual to review. Accepted — that is the job I just did.
- The `Z-line`, `Anlage KAP / KAP-INV` and `Steuerberater` assertions are
  positive requirements and are genuinely load-bearing.
- The anti-re-inlining fence (`public-landing.test.ts:157-165`, banning
  `"Performance &"`, `"Activity Statement"`, `"All time"`, `"Portfolios"`,
  `"view only"` from the page source) is the strongest test in the change: it is
  effectively impossible to hand-type a broker list without tripping it.
- `public-landing.test.ts:125-138` still asserts something real after
  `"All-Time JSON"` was removed — `"What you"` and `"BROKER_SUMMARIES"` both
  survive. Design §7.1's note on this is discharged.

Two brittleness nits: `expect(page).not.toContain("256")` and `/\b365\b/` at
`:222` and `:231` run against the raw source *including Tailwind classes*, so a
future `max-w-[256px]` or `w-365` fails for an unrelated reason. Scoping them to
a class-stripped read would keep the intent without the false positive.

### N6 — the `NextRequestLike` stub is fine

Called out in the brief as a possible weakness; it isn't. `getSessionCookie`
branches on `request instanceof Headers || !("headers" in request)`, so the stub
takes the `request.headers.get("cookie")` path and exercises the real
`parseCookies`, the real `__Secure-` prefix branch and the real `.`/`-` name
variants. `middleware()` touches only `.url` and `.headers`, so a real
`NextRequest` would add no coverage while dragging in Next's request internals.
The assertion that `location` is the absolute `https://ptfolio.net/dashboard`
is real coverage of the `new URL(…, request.url)` construction.

### N7 — `react-best-practices` / `nextjs-best-practices` on the new page

Correct by default: Server Component, no client boundary, `next/link` for
internal navigation, no dynamic APIs (fenced at `public-landing.test.ts:67-72`),
`force-static` as a build-time guarantee, both helper components at module scope
rather than nested inside `Landing`, and all Tailwind classes as complete
literals so JIT can see them.

Three nits:

1. `src/app/(marketing)/page.tsx:135-140` — `BrokerLine`'s `arrowClass` ternary
   falls through to `text-brand-coinbase` for any unrecognised id, so a fourth
   broker would silently render Coinbase blue. `summary.id` is already typed
   `InstructionBrokerId`; a `Record<InstructionBrokerId, string>` lookup would
   make the compiler force the decision.
2. `src/app/(marketing)/page.tsx:78`, `:83`, `:89` — the `icon` emoji (`📊`,
   `🇩🇪`, `₿`) render as text, so a screen reader announces "bar chart",
   "flag: Germany", "bitcoin sign" before each card title. They're decorative:
   `aria-hidden="true"` on the icon `div` at `:167`.
3. `src/app/(marketing)/page.tsx:168` — the three feature-card titles are
   `<div className="font-bold …">`. On the app's one page that exists to be
   crawled, making them `<h2>`/`<h3>` gives the crawler document structure for
   free. This is *not* covered by the issue #5 metadata deferral (design §8/Q3),
   which is about canonical/OG/JSON-LD, so it is the one place this change
   leaves SEO value unclaimed. Still non-blocking — the `<h1>` and prose are the
   ranking signal that mattered.

### N8 — e2e spec: good; two small things

Genuinely valuable coverage, and correctly not `describe.skip`-ed. The
JavaScript-disabled block is the one that actually proves the page isn't a
client shell — the right test to have written.

- `e2e/public-landing.spec.ts:37` asserts `"What you&#x27;ll need"`, coupling the
  test to React's entity escaping. `/What you.{0,8}ll need/` is equivalent and
  won't break on an escaping change.
- No security-header assertion on `/` (see N4).

### N9 — scope

- `CLAUDE.md` +9 lines (conductor role). Unrelated to issue #2, user-requested,
  not gated — as instructed. It should land as its own commit: mixing a
  process-doc change into a feature commit muddies the blame trail on the file
  that governs how the team works.
- `.claude/settings.json` +16/-1 adds `permissions.deny` entries for `.env`
  access. Security-positive, pre-existing dirty, unrelated to #2 — separate
  commit. Worth noting the `Bash(cat .env*)` / `Bash(cat *.env*)` patterns are
  hygiene rather than a control: they don't cover `less`, `head`, `grep`, `xxd`,
  `source`, `env`, or `cat ./.env`. Fine as a speed bump; don't rely on it.
- `numbers.txt` — untracked, 8 bytes of whitespace. Junk. Delete or gitignore;
  don't commit.
- `e2e/golden-path.spec.ts:21` `/` → `/dashboard` — in scope and correct. The
  file is `describe.skip`-ed, but the pointer would have been wrong the moment
  it is re-enabled.
- Everything else in the diff maps to an AC-SEO item. No scope creep in the
  source changes.

### N10 — design doc line citations have drifted

`docs/superpowers/specs/2026-08-29-public-landing-page-design.md` §2, §2.3, §2.5
and §9 cite `tests/routing/public-landing.test.ts:176-180` (forbidden imports),
`:172-174` (matcher) and `:152-165` (cookie names). In the shipped file those
assertions are at `:303-307`, `:299-301` and `:279-297` — the §7.1/§7.2 test
blocks were inserted above them. The `:92-108`, `:110-115`, `:125-138`,
`:67-82` and `:61-65` citations are still correct.

Non-blocking, but §9's enforcement map exists so a future reviewer can check the
guard instead of re-deriving the reasoning, and three of its pointers currently
land on the wrong assertion. Worth fixing before the design doc is treated as
settled.

---

## Design rulings I disagree with

Only one: **§7.1's prescribed Coinbase `path`** — see B1. The ruling to source
the labels from `broker-instructions.ts` is right; the specific value it
prescribed reintroduces the defect the ruling was written to eliminate.

§7.2, §8/Q1, §8/Q3, §8/Q4 and §8/Q5 I checked and agree with, including the
choice to leave `src/app/(app)/loading.tsx` where it is (§3.3) — moving it would
narrow the fallback for four sibling routes, which AC-SEO0.5 forbids.

---

## Gate

**Blocked on B1.** Fix is one line in
`src/lib/onboarding/broker-instructions.ts` and, per N1, ideally the ordering
assertion alongside it. Once `pnpm test` is green on that, the change is good to
push from my side — the security posture, the auth-flow migration, the copy
correctness and the test fencing are all sound.

The non-blocking items are worth a follow-up but none of them should hold this
change: N1, N2 and the N5 brittleness nits are test hardening; N4.1 and N8 are
cheap coverage additions; N7 is polish; N9 is commit hygiene; N10 and the stale
`CLAUDE.md` Next.js pin belong to `documentation-writer`.
