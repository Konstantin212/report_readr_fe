# First-Run Onboarding Clarity — Acceptance Criteria

Status: draft, ready for `architect`. Date: 2026-08-28.

Related existing docs (read before designing):
- [Open Self-Service Sign-Up — AC](2026-08-05-open-signup-ac.md) — sign-up is
  already open (`AUTH_SIGNUP_MODE` defaults to `"open"`,
  `src/lib/auth/signup-mode.ts`). This feature assumes cold, unknown users.
- [Vercel Web Analytics — Custom Event Tracking — AC](2026-08-07-analytics-events-ac.md)
  — owns the onboarding-tour events (`trackOnboardingTourStarted`,
  `trackOnboardingTourDismissed`, `trackOnboardingTourCompleted` and its
  `"upload" | "settings" | "explore"` next-action allow-list). This feature
  must not change that catalogue; see AC-OC0.4.

## User story

As a first-time, non-technical user arriving from public/organic traffic, I
want the app's instructions to match the screens I actually see and to stay
reachable after the welcome tour is gone, so that I can get my own data in
without guessing or giving up.

## Scope

**In scope — exactly four items:**
1. Coinbase connect instructions that match the real single-textarea form,
   plus a correct deep link at the end of the Coinbase-only tour path.
2. An always-reachable "how to export" affordance on `/upload`, backed by a
   single shared copy source (not a third divergent copy).
3. A first-run empty state on the dashboard, and removal of the misleading
   "history backfilling" string.
4. Removal of the "friends-only" positioning copy.

**Out of scope — no AC is written for these, and no change may be made to
them as a side effect:**
- **Revolut.** Do not add, remove, reword or reference Revolut anywhere,
  including the existing Revolut lines in
  `src/components/pulse/upload-dropzone.tsx:180-187`. They stay byte-identical.
- Resend domain verification / email deliverability.
- favicon, OG image, robots.txt, sitemap, SEO metadata.
- Mapping unparseable-file errors to human guidance.
- Privacy policy, Impressum, terms.
- Any tax logic, ledger, or Anlage KAP / KAP-INV / SO change. Nothing under
  `src/lib/tax` or any computation module is touched.
- New analytics events (see AC-OC0.4).

## Global rules

- **AC-OC0.1 (copy matches reality)** Given any instruction text shipped by
  this feature, when it describes a form, field or file, then it names the
  same number of inputs, the same field label, and the same artefact the user
  actually encounters. A reviewer must be able to point at the rendered
  component that each instruction step refers to.
- **AC-OC0.2 (single source of copy)** Given the same instructional copy is
  shown in more than one place, when it is implemented, then it exists as
  exactly one exported source consumed by every surface. Duplicating prose
  across components is a blocking defect — divergence between
  `welcome-tour.tsx` and `crypto-accounts-manager.tsx` is the root cause of
  Item 1.
- **AC-OC0.3 (no tax surface touched)** Given this feature is implemented,
  when the diff is reviewed, then it contains no change under `src/lib/tax`,
  the ledger, or any Anlage KAP / KAP-INV / SO code path, and every existing
  golden fixture passes unchanged.
- **AC-OC0.4 (analytics unchanged)** Given the onboarding tour already emits
  events per the analytics AC, when this feature changes tour behavior, then
  the event names and their property allow-lists are unchanged — in
  particular `trackOnboardingTourCompleted` still receives the literal
  `"settings"` for the Coinbase path even though the destination URL gains a
  query string (AC-OC1.5). No new events are added by this feature.
- **AC-OC0.5 (no regression for returning users)** Given a user who already
  has imported data, when any surface changed by this feature renders, then
  their existing dashboard, upload and settings behavior is unchanged apart
  from the copy corrections named below.

---

## Item 1 — Coinbase instructions match the real form

Current defects: `src/components/onboarding/welcome-tour.tsx:368`
`CoinbaseCard()` says at line 382 **"Copy the key + secret"** and at line 383
**"Paste them on the Settings → Crypto page here."** — implying two fields.
The real form (`src/components/pulse/crypto-accounts-manager.tsx:104-115`) is
one `<textarea>` labelled **"CDP Key JSON"** whose placeholder asks for the
whole blob, and `src/app/api/crypto/coinbase/connect/route.ts` parses that
blob shape via `parseCredentialsBlob`.

- **AC-OC1.1 (the .json file is named)** Given a user on the Coinbase step of
  the welcome tour, when the step renders, then the instructions state that
  Coinbase Developer Platform **downloads a `.json` file** when the key is
  created, and that this file is the thing the user needs — not two values
  copied from the screen.
- **AC-OC1.2 (open in a text editor)** Given the same step, when it renders,
  then it tells the user to **open that downloaded `.json` file in a text
  editor** (Notepad / TextEdit / any editor) and **copy its entire contents**.
- **AC-OC1.3 (one box, named exactly)** Given the same step, when it renders,
  then it tells the user to paste those entire contents into the **single**
  field labelled **"CDP Key JSON"** on **Settings → Crypto**, and the strings
  "Copy the key + secret" and "Paste them" no longer appear anywhere in the
  codebase.
- **AC-OC1.4 (permission wording preserved)** Given the same step, when it
  renders, then the existing read-only guidance survives intact: create the
  key at Coinbase Developer Platform → Portfolios → API keys → Create, with
  permissions **view only** (do not enable trade or send).
- **AC-OC1.5 (Coinbase path deep-links to the crypto section)** Given a user
  who selected **only** Coinbase in the tour selector, when they press the
  finish CTA (`finish()`, `welcome-tour.tsx:94-106`), then the app navigates
  to **`/settings?section=crypto`** — not `/settings`, which
  `src/app/(app)/settings/page.tsx:29` defaults to `section=brokers` and shows
  "No broker accounts yet. Upload a statement to register one.", the opposite
  of their task.
- **AC-OC1.6 (the deep link lands on the connect form)** Given that
  navigation completes, when the settings page renders, then the "Crypto
  exchanges" card and the `CryptoAccountsManager` connect form are visible
  without any further click, and the sidebar shows **Crypto** as the active
  section (`SETTINGS_SECTIONS` key `"crypto"`,
  `src/components/pulse/settings-sidebar.tsx:7`).
- **AC-OC1.7 (in-app pointers agree)** Given any other in-app copy that
  points a user at the Coinbase connect form — `ReadyCard`
  (`welcome-tour.tsx:419-423`) and the crypto page empty state
  (`src/app/(app)/crypto/page.tsx:25-28`, currently linking to bare
  `/settings`) — when it renders a link, then that link also targets
  `/settings?section=crypto`.
- **AC-OC1.8 (shared with the form)** Given the paste instruction now exists
  in the tour, when a user is on Settings → Crypto with no account connected,
  then the empty-state text there
  (`crypto-accounts-manager.tsx:148-155`) and the tour step draw the "paste
  the whole downloaded JSON file" wording from the one shared source required
  by AC-OC0.2, so the two can never drift again.

---

## Item 2 — `/upload` exposes the export instructions

Current defect: `src/components/pulse/upload-dropzone.tsx` shows only "Drop
statements here" plus accepted file types. The how-to-export steps live only
in `IbkrCard()` / `FreedomCard()` inside the welcome tour, which is one-shot:
any close path (X button, ESC, "skip tour") writes `tour_dismissed=1` to
localStorage permanently (`DISMISS_KEY`, `welcome-tour.tsx:13,81-87`).

- **AC-OC2.1 (a visible trigger exists)** Given any authenticated user on
  `/upload`, when the page renders, then a clearly labelled control (e.g.
  "How do I export my statement?") is visible near the dropzone, regardless of
  the value of `tour_dismissed` in localStorage and regardless of whether the
  user has any prior imports.
- **AC-OC2.2 (reveals inline, collapsed by default)** Given that control,
  when the user activates it, then the export instructions expand **inline on
  the upload page** — the welcome-tour modal is not opened and no navigation
  occurs. Activating it again collapses the instructions. The instructions are
  collapsed on first render.
- **AC-OC2.3 (keyboard and screen-reader usable)** Given the control, when a
  keyboard-only user reaches it via Tab, then it is focusable, activates with
  Enter/Space, and exposes its expanded/collapsed state to assistive
  technology (e.g. `aria-expanded` on the trigger tied to the revealed
  region).
- **AC-OC2.4 (IBKR content)** Given the instructions are expanded, when the
  user reads the IBKR section, then it contains the same four steps that
  `IbkrCard()` shows today — Client Portal → Performance & Reports →
  Statements; Activity Statement with period **Annual** (one per tax year);
  format **CSV**, sections **all**; **Run** then **Download** — plus "repeat
  for each year you need".
- **AC-OC2.5 (Flex Query warning preserved)** Given the IBKR section is
  visible, when the user reads it, then the existing warning is present:
  don't use the **Flex Query** CSV — column names differ; use the standard
  Activity Statement.
- **AC-OC2.6 (Freedom24 content)** Given the instructions are expanded, when
  the user reads the Freedom24 section, then it contains the same four steps
  `FreedomCard()` shows today — Freedom24 → top right → **Statements**; period
  **All time** (or the earliest year taxes are needed for); format **JSON**;
  **Download** — plus the example filename `2017xx_…_all.json` and the "why
  JSON, CSV exports drop fields the tax draft needs" note.
- **AC-OC2.7 (one source, three consumers)** Given AC-OC0.2, when this item is
  implemented, then the IBKR and Freedom24 export prose exists in exactly one
  module, and both `welcome-tour.tsx` (`IbkrCard` / `FreedomCard`) and the new
  `/upload` disclosure render from it. A `rg` for any distinctive sentence
  (e.g. "Flex Query") must return exactly one authoring site.
- **AC-OC2.8 (tour styling not required to match)** Given the shared source is
  extracted, when it renders inside the tour versus inside the upload page,
  then the wording is identical while the surrounding chrome (tour
  `GuideCard` accent bar / badge vs. the upload page's panel) may differ. Copy
  is shared; layout need not be.
- **AC-OC2.9 (no Revolut)** Given the new disclosure, when it renders, then it
  mentions only IBKR and Freedom24 — no Revolut content is added — and the
  pre-existing Revolut lines in the dropzone remain exactly as they are today.
- **AC-OC2.10 (does not disturb the queue)** Given a user with an upload batch
  in progress, when they expand or collapse the instructions, then the upload
  queue, its progress counters and the "Recently uploaded" list are unaffected.

---

## Item 3 — first-run empty state on the dashboard

Current defect: `src/app/(app)/page.tsx` renders, for a brand-new user with
zero data, a €0.00 hero, an empty allocation card, "No positions yet.", "No
data yet.", and at line 97 **"No chart yet — history backfilling."** — which
claims a background process that does not exist. There is no
"upload your first statement" call to action anywhere on the page.

In-repo precedent for tone and structure: `src/app/(app)/crypto/page.tsx:22-29`
— a single `Card`, one muted sentence, one inline link to the place that fixes
the emptiness.

- **AC-OC3.1 (first-run signal)** Given the dashboard renders, when the app
  decides whether the user is first-run, then the condition is **no imported
  statements and no connected crypto account** — reusing the existing
  `getImportCount(user.id)` (`src/lib/data/imports.ts`, already called by
  `src/app/(app)/layout.tsx:20` to drive `TourHost shouldShow`) together with
  the `hasAccounts` flag the page already loads via `getCryptoSummary`
  (`src/app/(app)/page.tsx:18`). No new data source is introduced.
- **AC-OC3.2 (empty state replaces the zero widgets)** Given a first-run user
  per AC-OC3.1, when they open the dashboard, then the €0.00 hero, the
  unrealized/realized tiles, the performance chart, the allocation donut, the
  currency card, the dividends card and the top-positions card are **not**
  rendered; a single first-run card is rendered in their place. Rationale:
  zero-value widgets read as a broken account, not as an empty one.
- **AC-OC3.3 (the card tells the user what to do)** Given that first-run card,
  when it renders, then it contains: a short headline stating there is no data
  yet, one sentence explaining that the app builds everything from broker
  statements and crypto syncs, a **primary call to action linking to
  `/upload`** worded as uploading your first statement, and a secondary link
  to `/settings?section=crypto` for users whose only source is Coinbase.
- **AC-OC3.4 (the tour stays reachable)** Given that first-run card, when it
  renders, then it also points the user at the **?** trigger in the topbar as
  the way to reopen the walkthrough — so a user who dismissed the tour has a
  path back.
- **AC-OC3.5 (misleading string removed)** Given any user, when the dashboard
  renders a performance chart with no data points, then the literal string
  "history backfilling" does not appear anywhere under `src/`, and the
  replacement copy does not assert that any background job is running,
  filling, or in progress. A non-first-run user with imports but an empty
  equity curve sees a neutral "no performance history yet" message instead.
- **AC-OC3.6 (empty state is not shown to users with data)** Given a user with
  at least one import **or** at least one connected crypto account, when they
  open the dashboard, then the normal dashboard renders exactly as it does
  today and the first-run card does not appear — including the Coinbase-only
  user, who has zero imports but real positions.
- **AC-OC3.7 (co-exists with the tour)** Given a brand-new user for whom the
  welcome tour auto-opens over the dashboard, when they dismiss or complete
  the tour, then the first-run card is visible underneath it. The two are
  independent; the empty state never depends on localStorage.

---

## Item 4 — remove "friends-only" positioning

Current defect: `src/components/onboarding/welcome-tour.tsx:231` reads
**"This is a small, friends-only portfolio + German tax tool."** — the first
sentence a public visitor reads, and it contradicts open sign-up.

- **AC-OC4.1 (string is gone)** Given the welcome tour opens on the welcome
  step, when `WelcomeCard` renders, then the exact string "small,
  friends-only" no longer appears, and a case-insensitive search for
  "friends-only" across `src/` returns no results. (Verified 2026-08-28: this
  is the only occurrence in the codebase.)
- **AC-OC4.2 (replacement is public-appropriate)** Given the replacement copy,
  when it renders, then it describes the app as a portfolio + German tax tool
  without implying private, invite-only, or restricted access, and without
  claiming anything about scale, user counts, company status, or guarantees.
- **AC-OC4.3 (rest of the card unchanged)** Given the replacement, when the
  welcome step renders, then the two existing bullets (single view of stocks /
  ETFs / bonds / dividends / crypto across Freedom24, Interactive Brokers and
  Coinbase; Anlage KAP + Anlage SO draft each January) and the "reopen from
  the ? in the top bar" footnote are unchanged.
- **AC-OC4.4 (consistent with sign-up mode)** Given `AUTH_SIGNUP_MODE`
  defaults to `"open"`, when any onboarding copy is reviewed, then no
  onboarding surface tells the user that access is limited to a known group.

---

## Traceability

| AC | Surface | Suggested verification |
|---|---|---|
| AC-OC0.2 | shared copy module | `rg` for a distinctive sentence returns one authoring site |
| AC-OC0.3 | whole diff | existing tax golden fixtures pass unchanged |
| AC-OC0.4 | `welcome-tour.tsx` `finish()` | unit test: completing Coinbase-only path calls `trackOnboardingTourCompleted("settings")` |
| AC-OC1.1–1.4 | tour Coinbase step | component test asserts `.json` / text editor / "CDP Key JSON" wording; asserts old strings absent |
| AC-OC1.5–1.6 | `finish()` + settings page | unit test: `router.push("/settings?section=crypto")`; e2e: crypto card visible after finish |
| AC-OC1.7 | ReadyCard, crypto page | assertion on link `href` |
| AC-OC1.8 | crypto settings empty state | both surfaces render text from the shared source |
| AC-OC2.1–2.3 | `/upload` | component test: trigger present with `tour_dismissed=1` set; toggle + `aria-expanded` |
| AC-OC2.4–2.6 | `/upload` disclosure | text assertions incl. "Flex Query" and `_all.json` |
| AC-OC2.7–2.8 | shared source | both tour and upload render identical strings |
| AC-OC2.9 | `/upload` | snapshot of the Revolut lines is byte-identical to today |
| AC-OC2.10 | `/upload` | queue state survives toggle |
| AC-OC3.1–3.4 | dashboard | render with zero imports + no crypto account: first-run card, `/upload` CTA, `/settings?section=crypto` link |
| AC-OC3.5 | dashboard | `rg "history backfilling"` returns nothing; empty-curve render shows neutral copy |
| AC-OC3.6 | dashboard | render with 1 import, and with 0 imports + 1 crypto account: normal dashboard |
| AC-OC3.7 | dashboard | first-run card renders independent of localStorage |
| AC-OC4.1–4.4 | tour welcome step | `rg -i "friends-only"` returns nothing; bullets unchanged |

## Open questions for the architect

1. **Where the shared copy lives.** Two viable shapes: a data module
   (structured steps + notes rendered by each surface) or small shared React
   components rendered inside different chrome. AC-OC0.2 mandates one source;
   it does not mandate the shape. AC-OC2.8 allows the chrome to differ, which
   suggests the data-module shape is the safer default.
2. **Exact replacement wording** for AC-OC3.5 and AC-OC4.2 is the author's
   choice within the stated constraints; the AC fixes the semantics, not the
   sentence.
