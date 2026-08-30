# Onboarding surfaces — instruction copy, the `/upload` disclosure & the first-run dashboard

Status: **implemented** (2026-08-28), extended 2026-08-29 by the public
landing page (§1.1, §7).

What a user sees before they have any data: the public landing page at `/`,
the welcome tour, the "how do I export a statement?" disclosure on `/upload`,
the Settings → Crypto empty state, and the dashboard's first-run card. This
doc records the invariants that keep those five surfaces consistent and says
**where to edit each thing**. Full rationale, alternatives and the per-file
change plan live in the driving specs —
[AC](superpowers/specs/2026-08-28-onboarding-clarity-ac.md) and
[design](superpowers/specs/2026-08-28-onboarding-clarity-design.md) for the
in-app surfaces,
[AC](superpowers/specs/2026-08-29-public-landing-page-ac.md) and
[design](superpowers/specs/2026-08-29-public-landing-page-design.md) for the
landing page.

## 1. All broker instruction prose has exactly one authoring site

**`src/lib/onboarding/broker-instructions.ts` is the only file that may
contain broker export/connect instruction wording.** Editing that prose
anywhere else is a defect, not a shortcut: divergence between the tour and
the Settings → Crypto form is what produced the wrong Coinbase instructions
this feature fixed (the tour told users to copy a key + secret pair; the form
has one `CDP Key JSON` textarea).

The module is deliberately plain TypeScript — no JSX, no `"use client"`, no
Tailwind class names. Copy is expressed as `CopySpan[]` (plain string, or
`{ t, em: "strong" | "code" | "link" }`), grouped into an
`InstructionSection` (`badge`, `title`, optional `lead`, `steps`, `notes`,
optional `footnote`).

| Want to change… | Edit |
|---|---|
| IBKR / Freedom24 / Coinbase instruction wording | `BROKER_INSTRUCTIONS` in `src/lib/onboarding/broker-instructions.ts` |
| The "paste the whole downloaded `.json`" sentence | `coinbasePasteInstruction(where)` in the same module — one sentence, one variable trailing clause |
| Which brokers the `/upload` disclosure lists | `UPLOAD_INSTRUCTION_SECTIONS` (explicit list; Coinbase is excluded because it is a live API sync, not a file upload) |
| The landing page's one-line-per-broker orientation list | `BROKER_SUMMARIES` in the same module — see §1.1, and expect to change `BROKER_INSTRUCTIONS` too |
| How that copy *looks* (bold, code chips, links, ordered list) | `src/components/onboarding/instruction-copy.tsx` (`Spans`, `InstructionBody`) |
| Chrome around a section (accent bar, badge colour, panel) | The consuming component, never the copy module |

Brand accent classes (`bg-brand-ibkr` etc.) stay in `welcome-tour.tsx`. The
copy module carries `badge: "IBKR"` but never a class name — that split is
what keeps the module importable from a node-environment Vitest test and
keeps Tailwind's purge honest.

### Consumers

| Surface | File | Renders |
|---|---|---|
| Welcome tour (IBKR / Freedom24 / Coinbase cards) | `src/components/onboarding/welcome-tour.tsx` | `InstructionBody` inside `GuideCard` |
| `/upload` disclosure | `src/components/pulse/export-instructions.tsx` | `InstructionBody` for `UPLOAD_INSTRUCTION_SECTIONS` |
| Settings → Crypto empty state | `src/components/pulse/crypto-accounts-manager.tsx` | `Spans spans={coinbasePasteInstruction("on-settings-crypto-page")}` |
| Public landing page "what you'll need" list | `src/app/(marketing)/page.tsx` | `BROKER_SUMMARIES` (§1.1) — not `InstructionBody` |

`instruction-copy.tsx` has **no** `"use client"` directive on purpose: it has
no hooks, state or handlers, so it adopts whichever environment imports it
and works in both the server tree and inside client consumers.

## 1.1 The second consumer shape: `BROKER_SUMMARIES`

§1's rule is unchanged — the module is still the only authoring site — but as
of 2026-08-29 it exports **two** shapes rather than one, for two audiences:

| Export | Audience | Content |
|---|---|---|
| `BROKER_INSTRUCTIONS` (`InstructionSection`) | a user who already has an account and is about to export | the full walkthrough: steps, warnings, notes |
| `BROKER_SUMMARIES` (`BrokerSummary`) | an anonymous visitor on the **public** landing page | one orientation line per broker: `label`, `path` (menu chain), `artifact` (what you end up with), optional `note` |

`BrokerSummary` exists so the landing page's "what you'll need" list *derives*
from the instructions instead of retyping menu paths. The distinction the
[landing-page AC](superpowers/specs/2026-08-29-public-landing-page-ac.md)
(AC-SEO6.2) draws is between an *orientation* summary — permitted — and a
second set of *instructions* — not permitted. The
[design](superpowers/specs/2026-08-29-public-landing-page-design.md) §8/Q2
ruled that the landing list is orientation, **on condition that its labels are
sourced from this module**. That condition is what §1.1's invariant enforces.

The stakes are higher here than anywhere else in §1: a stale in-app
instruction is a support ticket, whereas a stale landing-page summary is a
public, indexed, wrong instruction that Google serves.

### The derivation invariant

Enforced in `tests/onboarding/broker-instructions.test.ts` over the **imported
values** — not by fencing phrases in source text, so a rename inside
`BROKER_INSTRUCTIONS` cannot leave a wrong menu path behind on the landing
page:

- `BROKER_SUMMARIES` covers exactly the brokers `BROKER_INSTRUCTIONS` owns —
  no more, no fewer.
- Every string in `path` and `artifact` appears **verbatim** in that broker's
  own `InstructionSection`, and the `path` segments appear in the
  instructions' own order.
- The `path` is the whole arrow-joined menu chain **from the broker's front
  door**: contiguous, in sequence, with nothing arrow-joined allowed to
  precede it.
- A summary stays an orientation line: no `path`/`artifact` label may end in
  sentence punctuation.

### The elision rule

A summary may drop a leading menu segment **only** by declaring it in the
`ELIDED_PATH_LEAD` map in that test file, with the reason it is safe to drop.
Anything arrow-joined ahead of a summary's first segment that is not declared
there fails the front-door assertion. Currently declared:

| Broker | Elided | Why it is safe |
|---|---|---|
| `ibkr` | `Client Portal` | It is IBKR's only web UI, so it is where a reader told "Interactive Brokers" already is. Naming it adds no orientation. |
| `freedom` | `Freedom24`, `top right` | The summary's own label already says Freedom24, and "top right" is a screen position rather than a destination anyone can look up. |
| `coinbase` | *(nothing)* | The **Coinbase Developer Platform** is a separate product from the Coinbase retail app that the word "Coinbase" sends a reader to, so the summary has to name it. |

**Why the rule exists, rather than just the verbatim check:** the verbatim
assertion alone passes a summary that quotes real segments but starts the
reader inside a product they were never told to open. Code-review finding B1
([review](superpowers/specs/2026-08-29-public-landing-page-review.md)) caught
exactly that — the Coinbase summary rendered `Portfolios → API keys`, a
Developer Platform menu that does not exist in the retail app. The design
itself had prescribed that shape, so this is not a slip a careful author would
have avoided; it is a gap in the invariant, and `ELIDED_PATH_LEAD` is the
closure. Adding a broker means deciding, and writing down, which lead segments
that broker's summary may omit.

## 2. The `/upload` disclosure is a sibling of the dropzone label

`ExportInstructions` is mounted in `upload-dropzone.tsx` **after** the closing
`</label>`, never inside it. The dropzone label wraps a hidden
`<input type="file">`, so any click within it — including on a nested button —
opens the file picker. Placing the trigger outside removes the hazard
structurally instead of papering over it with `stopPropagation`.

Two further structural rules:

- **Open/closed state lives in the disclosure leaf**, not in `UploadDropzone`,
  so toggling re-renders only the leaf and never puts an in-flight upload
  queue or its progress counters on the toggle's render path.
- **No `localStorage`, no props, no context.** The trigger is unconditional
  markup, so it stays reachable regardless of `tour_dismissed` and regardless
  of whether the user has prior imports. The welcome tour is one-shot; this is
  the permanent path to the same instructions.

Accessibility is carried by a native `<button type="button">` with
`aria-expanded` and `aria-controls`. The panel stays in the DOM and is hidden
via the `hidden` attribute rather than conditionally rendered, so
`aria-controls` always resolves and find-in-page still works.

## 3. First-run dashboard

**Predicate:** `isFirstRun()` in `src/lib/onboarding/first-run.ts` —
`importCount === 0 && !hasCryptoAccounts`. Both conditions, never one: a
Coinbase-only user has zero imports but real positions and must see the normal
dashboard.

`src/app/(app)/dashboard/page.tsx` takes an early return to `FirstRunCard`
(`src/components/onboarding/first-run-card.tsx`) when the predicate holds. An
early return rather than a wrapping ternary, so "the hero, tiles, chart,
donut, currency, dividends and top-positions widgets are not rendered" is true
by construction and the returning-user path is a literal no-diff. Eight
zero-valued widgets read as a broken account, not an empty one.

**Path note (2026-08-29):** the dashboard used to live at
`src/app/(app)/page.tsx` and own `/`. It moved to
`src/app/(app)/dashboard/page.tsx` when `/` became the public landing page
(see [landing-page AC](superpowers/specs/2026-08-29-public-landing-page-ac.md)
AC-SEO3.4). Nothing in this section's behaviour changed — but
`tests/onboarding/copy.test.ts` asserts §3 by reading that file **by path**,
so moving the dashboard again means updating the test in the same change or
the assertions silently stop reading anything.

`FirstRunCard` is a **server component**: it derives purely from server data
and reads no browser storage, so it renders underneath the auto-opened tour
and survives every dismiss path. Its route back to the walkthrough is copy
pointing at the topbar `?` that already exists — not a second client-side
trigger, which would force `"use client"` onto the dashboard's empty state.

**Signal plumbing:** `getImportCount` (`src/lib/data/imports.ts`) is wrapped
in React `cache()`. The app layout already calls it to decide whether to
auto-open the tour, and the dashboard page now calls it too; memoization
collapses both to one `count(*)` per request. A layout cannot pass props into
its `children` in the App Router, so per-request memoization is the supported
substitute for prop-drilling here. Anything else that needs the import count
during a request should call `getImportCount` directly rather than threading
it through props.

**Behavioural consequence, by decision not accident:** an existing user who
deletes all imports and disconnects Coinbase now sees the first-run card
rather than a zeroed dashboard.

## 4. Tour navigation is decoupled from tour analytics

`src/lib/onboarding/tour-next-action.ts` exports two separate functions:

- `tourNextAction(selected)` → `"upload" | "settings" | "explore"` — the value
  handed to `trackOnboardingTourCompleted`. This is an analytics allow-list
  member (see the [analytics design](superpowers/specs/2026-08-07-analytics-events-design.md));
  it must stay one of those three literals.
- `tourDestination(action)` → `"/upload" | "/settings?section=crypto" | null` —
  where `finish()` navigates.

Keeping them separate is the invariant: the Coinbase path deep-links to
`/settings?section=crypto` while still emitting the literal `"settings"`, and
it is not *possible* to widen the analytics value by editing a URL, because
the event argument no longer flows from anything URL-shaped.

**Every in-app pointer at the Coinbase connect form uses
`/settings?section=crypto`, never bare `/settings`** — the bare path defaults
to `section=brokers` and shows "No broker accounts yet", the opposite of that
user's task. Current call sites: `welcome-tour.tsx` (`finish()` and
`ReadyCard`), `first-run-card.tsx`, `crypto/page.tsx`, `crypto-card.tsx`.

## 5. Copy the app must not claim

Two strings were removed for being untrue, and the tests below keep them out:

- **"history backfilling"** — the empty performance chart claimed a background
  job that does not exist. Replacement copy (`No performance history yet.`)
  must not assert that anything is running, filling or in progress.
- **"small, friends-only"** — contradicts `AUTH_SIGNUP_MODE` defaulting to
  `"open"` (see [Open Self-Service Sign-Up](superpowers/specs/2026-08-05-open-signup-ac.md)).
  No onboarding surface may tell the user access is limited to a known group,
  and replacement copy must not claim scale, user counts, company status or
  guarantees.

**The public landing page at `/` is inside this rule (2026-08-29).** AC-SEO6.1
applies AC-OC4.4 to it explicitly, and
`tests/onboarding/copy.test.ts`'s `ONBOARDING_SURFACES` set now includes
`src/app/(marketing)/page.tsx` alongside `src/app/sign-in/page.tsx` and
everything under `src/components/onboarding/`. Six patterns are banned there —
`friends-only`, `invite-only`, `by invitation`, `closed`/`private beta`,
`waitlist`, `request`/`early access`. The ban matters more on `/` than
anywhere else: it is the one surface that is public, indexed and read before
the visitor has any other information about the product, and `AUTH_SIGNUP_MODE`
defaults to `"open"`, so a restricted-access claim there is both untrue and
permanently quotable.

Two further prohibitions the landing page carries that the in-app surfaces do
not need, because it is the only surface addressing people with no account
(landing-page [design](superpowers/specs/2026-08-29-public-landing-page-design.md)
§8/Q4): no data-handling claim the code does not substantiate (checked against
the [data-lifecycle doc](superpowers/specs/2026-08-05-open-signup-data-lifecycle.md)),
and no tax rate, threshold, Anlage line number or legal conclusion. Naming the
artefacts ("Anlage KAP", "Anlage SO") and the paragraphs ("§22", "§23") is
orientation and is fine; quoting a figure is not, because a public page
quoting a threshold inherits `CLAUDE.md`'s BMF-verification standard without
inheriting the verification.

## 6. What the tests actually pin

Vitest runs `environment: "node"` with `include: ["tests/**/*.test.ts"]` — no
jsdom, and `.tsx` test files are not collected. That constraint is why the
copy, the first-run predicate and the tour destinations are pure `.ts`
modules: everything asserted below is a real import, not a source-text grep.

| Test | Covers |
|---|---|
| `tests/onboarding/broker-instructions.test.ts` | Step counts and shipped wording for all three brokers; the Flex Query warning; that the old Coinbase key+secret strings are gone; `UPLOAD_INSTRUCTION_SECTIONS` is exactly `["ibkr", "freedom"]`; and the §1.1 derivation invariant for `BROKER_SUMMARIES`, including the `ELIDED_PATH_LEAD` front-door rule |
| `tests/onboarding/first-run.test.ts` | Full truth table for `isFirstRun`, including the Coinbase-only user |
| `tests/onboarding/tour-next-action.test.ts` | The analytics literal and the destination URL, separately |
| `tests/onboarding/copy.test.ts` | Cross-cutting source-text gate: one authoring site per distinctive sentence; banned strings absent across `ONBOARDING_SURFACES` (now including `src/app/(marketing)/page.tsx`); the first-run branch read from `src/app/(app)/dashboard/page.tsx` by path; the disclosure mounted outside the label; no `localStorage` in the disclosure |
| `tests/routing/public-landing.test.ts` | The landing page's structural guarantees: `/` static with no session read on the path, `(app)` owning no `/`, the middleware matcher and its forbidden imports, dashboard-pointer migration, nav active state, `/sign-in` carrying no marketing prose |

**Known gap, stated rather than hidden:** nothing proves the disclosure
*renders*, that `aria-expanded` flips at runtime, or that clicking the trigger
does not open the file picker — those need a DOM this repo's test setup does
not have. The structural choices in §2 are what actually carry that
behaviour; the tests only pin those choices in place. Closing the gap means
adding jsdom + Testing Library, or a Playwright e2e on `/upload`.
