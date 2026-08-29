# First-Run Onboarding Clarity — Design Spec

Status: ready for `developer`. Date: 2026-08-28.
Designs against: [AC](2026-08-28-onboarding-clarity-ac.md) (authoritative).

Related:
- [Vercel Web Analytics — Custom Event Tracking — Design](2026-08-07-analytics-events-design.md)
  §4.9 owns the onboarding-tour call sites. This design changes **where the
  tour navigates**, never **what it emits** (AC-OC0.4).
- [Open Self-Service Sign-Up — AC](2026-08-05-open-signup-ac.md) — sign-up is
  open by default, which is why AC-OC4 exists.

---

## 0. What changes, in one paragraph

Three instruction surfaces (welcome tour, `/upload`, Settings → Crypto) stop
authoring their own prose and start rendering one structured copy module,
`src/lib/onboarding/broker-instructions.ts`. `/upload` gains a collapsed,
keyboard-operable disclosure that renders the IBKR + Freedom24 sections of that
module in its own chrome. The Coinbase instructions are rewritten to describe
the real single-textarea `CDP Key JSON` form, and the tour's Coinbase finish
path now lands on `/settings?section=crypto`. The dashboard grows an early
return: a first-run user (no imports **and** no crypto account) sees one
`FirstRunCard` instead of eight zero-valued widgets. Two misleading strings
("history backfilling", "small, friends-only") are replaced. Three tiny pure
modules (`broker-instructions.ts`, `first-run.ts`, `tour-next-action.ts`) carry
everything that needs asserting, so the whole feature is testable under this
repo's node-environment Vitest with no new test tooling.

**No new dependencies. No DB migration. No new query.** (`getImportCount` is
reused and memoized — see §4.) Nothing under `src/lib/tax`, the ledger, or
Anlage KAP/KAP-INV/SO is touched (AC-OC0.3).

---

## 1. Open question 1 — shape of the shared copy source: **resolved**

### Decision: a structured data module of typed copy spans, plus a thin
### presentational renderer. Not shared React components.

**Module:** `src/lib/onboarding/broker-instructions.ts` — plain TypeScript, no
JSX, no `"use client"`, no React import, no Tailwind class names.

**Why this shape**

| Criterion | Data module (chosen) | Shared React components (rejected) |
|---|---|---|
| Divergence structurally impossible (AC-OC0.2) | Yes — prose exists only as string literals in one `.ts` file; `rg "Flex Query"` hits exactly one file | Yes, but only for whole-block reuse; partial reuse (the Coinbase paste sentence inside the settings empty state, AC-OC1.8) forces a copy-paste |
| Differing chrome (AC-OC2.8) | Free — chrome lives entirely in the consumer | Requires prop-drilling classNames / slot props into the shared component |
| Testable under `environment: "node"` (no jsdom) | Yes — import the module, assert strings | No — asserting a component's words requires rendering it, or falls back to source-text scraping |
| Vitest `include` is `tests/**/*.test.ts` (not `.tsx`) | A `.ts` data module imports cleanly | A `.tsx` component cannot be imported from a `.ts` test without a transform this repo doesn't have |
| Presentation/data boundary (`software-architecture` skill) | Copy in `lib/`, rendering in `components/` | Mixes both |

The last two rows are decisive: this repo's tests can read data but cannot
render DOM (`vitest.config.ts:5`, and the documented rationale in
`tests/auth/copy.test.ts:6-29`). A data module turns every copy AC from a
source-text grep into a real assertion.

**Tailwind caveat, deliberate:** brand accent classes (`bg-brand-ibkr` etc.)
stay in `welcome-tour.tsx`, **not** in the data module. The module carries
`badge: "IBKR"` (copy) but never `badgeBgClass` (presentation).

### 1.1 Exported shape

```ts
// src/lib/onboarding/broker-instructions.ts

/** Broker whose export/connect instructions this module owns. */
export type InstructionBrokerId = "ibkr" | "freedom" | "coinbase";

/**
 * One run of instruction text. A bare string is plain prose; the object
 * forms carry emphasis that every surface must render the same way.
 * `em: "code"` is the monospace chip used for filenames/extensions.
 */
export type CopySpan =
  | string
  | { t: string; em: "strong" }
  | { t: string; em: "code" }
  | { t: string; em: "link"; href: string };

export type InstructionSection = {
  id: InstructionBrokerId;
  /** Short brand label rendered in a badge, e.g. "IBKR". */
  badge: string;
  /** Section heading, e.g. "Get your IBKR Activity Statement". */
  title: string;
  /** Optional lead paragraph above the numbered steps. */
  lead?: CopySpan[];
  /** The numbered steps, in order. */
  steps: CopySpan[][];
  /** Body paragraphs after the steps. */
  notes: CopySpan[][];
  /** De-emphasised trailing footnote (warning / rationale). */
  footnote?: CopySpan[];
};

/** The single authoring site for all three brokers' instruction prose. */
export const BROKER_INSTRUCTIONS: Record<InstructionBrokerId, InstructionSection>;

/**
 * Sections the /upload disclosure shows, in order. Statement-upload brokers
 * only — Coinbase is a live API sync, not a file upload. AC-OC2.9: this list
 * is also why the disclosure can never grow a Revolut section by accident.
 */
export const UPLOAD_INSTRUCTION_SECTIONS: readonly InstructionSection[];

/**
 * AC-OC1.2/1.3/1.8 — the single authoring site for "open the downloaded
 * .json and paste all of it". `where` swaps ONLY the pointer to the target
 * field, so the tour and the Settings → Crypto empty state can never
 * disagree on the substance.
 */
export function coinbasePasteInstruction(
  where: "on-settings-crypto-page" | "elsewhere",
): CopySpan[];

/** Flattens spans to plain text. Used by tests and by `title`/`aria-label`. */
export function spansToText(spans: CopySpan[]): string;
```

`coinbasePasteInstruction` being a *function* rather than two constants is the
point: there is one sentence, with one variable clause. `rg "entire contents"`
returns exactly one authoring site (AC-OC0.2, AC-OC2.7, AC-OC1.8).

### 1.2 The renderer

`src/components/onboarding/instruction-copy.tsx` — presentational only, **no**
`"use client"` directive (it has no hooks, no state, no event handlers), so it
renders in both the server tree and inside `"use client"` consumers.

```tsx
export function Spans({ spans }: { spans: CopySpan[] }): React.ReactNode
export function InstructionBody({ section }: { section: InstructionSection }): React.ReactNode
```

`InstructionBody` renders, with **no surrounding chrome**: optional lead `<p>`,
an `<ol className="space-y-2.5 list-decimal pl-5">` of steps, the notes as
`<p>`s, and the footnote as the existing `font-mono text-[11px] text-dim`
paragraph. That markup is lifted verbatim from today's `IbkrCard`/`FreedomCard`
bodies, so the tour renders byte-identically to today apart from the corrected
words (AC-OC0.5).

`Spans` maps span → element: `"strong"` → `<b>`, `"code"` → the existing
`<code className="font-mono text-[12px] bg-panel2 px-1.5 py-0.5 rounded">`,
`"link"` → `<a className="text-mint underline">` with
`target="_blank" rel="noreferrer"` when `href` starts with `http`. Index keys
are safe: the arrays are module-level constants that never reorder.

### 1.3 How each of the three consumers renders it

**(a) Welcome tour** — `welcome-tour.tsx`. `GuideCard` is unchanged; only its
children and title change.

```tsx
function IbkrCard() {
  const s = BROKER_INSTRUCTIONS.ibkr;
  return (
    <GuideCard accentClass="bg-brand-ibkr" badge={s.badge}
               badgeBgClass="bg-brand-ibkr" title={s.title}>
      <InstructionBody section={s} />
    </GuideCard>
  );
}
```

`FreedomCard` and `CoinbaseCard` are the same three lines with
`BROKER_INSTRUCTIONS.freedom` / `.coinbase` and their own brand classes.

**(b) `/upload` disclosure** — `export-instructions.tsx` (§3). Same
`InstructionBody`, different chrome: a `bg-panel border border-border
rounded-xl` panel with a `font-mono text-[11px] uppercase tracking-widest
text-dim` badge instead of the tour's accent bar. AC-OC2.8 satisfied by
construction — the copy component contains no chrome at all.

**(c) Settings → Crypto empty state** — `crypto-accounts-manager.tsx:148-155`
becomes:

```tsx
<div className="text-muted text-sm">
  No Coinbase account connected.{" "}
  <Spans spans={coinbasePasteInstruction("on-settings-crypto-page")} />
</div>
```

The existing `portal.cdp.coinbase.com` link moves into the shared spans as an
`em: "link"` span, so the "create a read-only CDP key at …" clause is also
single-sourced. The **second** `portal.cdp.coinbase.com` link on this file
(line 197-203, the "also delete it there to fully revoke" note) is a different
sentence about revocation and is **left untouched** — it is not instruction
prose shared with any other surface.

---

## 2. Open question 2 — replacement wording: **resolved**

### AC-OC3.5 — `src/app/(app)/page.tsx:97`

Current: `No chart yet — history backfilling.`

**Proposed: `No performance history yet.`**

Why this and not something longer: the AC forbids asserting that anything is
running, filling or in progress. Any explanatory tail ("…it appears once there
are two days of valued holdings") would make a claim about
`computeEquityCurve`'s preconditions that nobody has verified as part of this
work, and would be a second thing to keep true. The bare sentence also matches
the page's own neighbours — `No positions yet.` (line 105) and `No data yet.`
(line 114) — so the card row reads consistently. Rendered in the existing
`h-[230px] flex items-center justify-center text-muted text-sm` wrapper,
unchanged.

Note this string is reached by **non-first-run** users only (a first-run user
never renders the chart card at all, §4), which is exactly AC-OC3.5's second
sentence.

### AC-OC4.2 — `src/components/onboarding/welcome-tour.tsx:231`

Current: `This is a small, friends-only portfolio + German tax tool. Upload
your broker statements once, and you get:`

**Proposed: `This is a portfolio + German tax tool. Upload your broker
statements once, and you get:`**

The edit deletes exactly the two disallowed words and nothing else:
"friends-only" (restricted-access claim, contradicts `AUTH_SIGNUP_MODE=open`)
and "small" (a scale claim, forbidden by AC-OC4.2). It asserts no user count,
no company status, no guarantee. The sentence keeps its role as the card's
one-line "what is this", and the second sentence, both bullets and the "reopen
via ? in the top bar" footnote are untouched (AC-OC4.3).

---

## 3. `/upload` disclosure (AC-OC2.1–2.3, AC-OC2.10)

### Decision: a **new client leaf**, mounted as a **sibling of the `<label>`**,
### owning its own state.

**New file:** `src/components/pulse/export-instructions.tsx`, `"use client"`.

Two structural reasons, both about AC-OC2.10:

1. **Sibling, not child, of the `<label>`.** `upload-dropzone.tsx:150-188` is a
   `<label>` wrapping a hidden `<input type="file">`. *Any* click inside that
   label — including on a nested `<button>` — activates the file picker. The
   usual fix is `e.stopPropagation()`, which is fragile (it does not stop label
   activation reliably across browsers, and it silently breaks if the markup is
   later restructured). Rendering the disclosure **after `</label>`** removes
   the hazard entirely: there is no label ancestor, so there is nothing to
   stop. No `stopPropagation`, no `preventDefault`, no `htmlFor` juggling.
2. **State in the leaf, not in `UploadDropzone`.** If `open` lived in
   `UploadDropzone`, every toggle would re-render the whole dropzone —
   including the in-flight queue list and progress counters — mid-upload.
   Functionally survivable (React preserves state across re-render), but it
   puts the queue on the toggle's render path for no reason. With the state in
   the leaf, a toggle re-renders *only* the leaf: `queue`, `processing`,
   `items` and `addFiles` are provably untouched. This is also the
   `react-best-practices` "push state down" rule.

### Markup and a11y (AC-OC2.2, AC-OC2.3)

```tsx
"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { UPLOAD_INSTRUCTION_SECTIONS } from "@/lib/onboarding/broker-instructions";
import { InstructionBody } from "@/components/onboarding/instruction-copy";

const PANEL_ID = "export-instructions-panel";

export function ExportInstructions() {
  const [open, setOpen] = useState(false);   // collapsed by default (AC-OC2.2)
  return (
    <section className="bg-panel border border-border rounded-xl">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={PANEL_ID}
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left …"
      >
        <span className="font-semibold text-sm">How do I export a statement?</span>
        <ChevronDown aria-hidden className={`w-4 h-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div id={PANEL_ID} hidden={!open} className="px-4 pb-4 space-y-6 border-t border-border pt-4">
        {UPLOAD_INSTRUCTION_SECTIONS.map(s => (
          <div key={s.id} className="space-y-3">
            <div className="font-mono text-[10px] uppercase tracking-widest text-dim">{s.badge}</div>
            <h3 className="font-semibold text-[15px]">{s.title}</h3>
            <div className="text-ink/90 leading-relaxed space-y-3"><InstructionBody section={s} /></div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

Design points:

- A native `<button type="button">` is keyboard-operable (Enter **and** Space)
  and focusable with zero custom key handling — AC-OC2.3 without a `tabIndex`
  or `onKeyDown` in sight. `type="button"` matters: the dropzone sits inside no
  form today, but the attribute makes it inert if that ever changes.
- `aria-expanded` on the trigger, `aria-controls` → the panel's `id`. The panel
  is **always in the DOM**, hidden via the `hidden` attribute (Tailwind
  preflight applies `[hidden]{display:none}`), so `aria-controls` always
  resolves to a real element and browser find-in-page behaviour stays sane. A
  `{open && …}` conditional would leave `aria-controls` dangling when collapsed.
- Chevron is `aria-hidden` — the state is already announced by
  `aria-expanded`; a second announcement would be noise.
- **No `localStorage`, no props, no context.** The trigger's visibility is
  therefore independent of `tour_dismissed` and of the user's import history
  (AC-OC2.1) — it is unconditional markup.

### Mount point

`upload-dropzone.tsx`, one added line immediately after `</label>` (line 188)
and one import. Nothing else in that file changes; the Revolut `<div>`s at
lines 179-187 stay byte-identical (AC-OC2.9).

```tsx
      </label>

      <ExportInstructions />

      {queue.length > 0 && ( … )}
```

Not mounted from `upload/page.tsx`: `UploadDropzone` owns the whole
`<section className="space-y-6">`, so a page-level mount would land *after*
"Recently uploaded", which is not "near the dropzone" (AC-OC2.1).

---

## 4. Dashboard first-run branch (AC-OC3.1–3.4, 3.6, 3.7)

### 4.1 Where the branch lives: the page, as an early return

`src/app/(app)/page.tsx` (server component) gains:

```tsx
const [d, crypto, importCount] = await Promise.all([
  getDashboardData(user.id, broker),
  getCryptoSummary(user.id),
  getImportCount(user.id),
]);

// AC-OC3.2 — zero-valued widgets read as a broken account, not an empty
// one. A first-run user gets one card instead of the whole dashboard.
if (isFirstRun({ importCount, hasCryptoAccounts: crypto.hasAccounts })) {
  return <FirstRunCard />;
}

return ( /* today's dashboard, unchanged */ );
```

An **early return** rather than a wrapping ternary: it is the only shape that
makes AC-OC3.2 ("hero, tiles, chart, donut, currency, dividends and
top-positions are not rendered") true by construction and AC-OC3.6 ("otherwise
exactly today's dashboard") a literal no-diff on the existing JSX.

### 4.2 How the first-run signal is obtained: **page calls it, wrapped in `cache()`**

The layout **cannot** pass it down. In the App Router a layout receives
`children` as an already-constructed opaque `ReactNode`; there is no supported
way to inject props into it. The only "pass down" options are React Context
(client-only — would force `"use client"` on the dashboard, which is exactly
what the constraints forbid) or a module-level mutable global (request-unsafe
on a serverless runtime, and a shared-mutable-state coupling the
`software-architecture` skill rules out).

So the page calls `getImportCount(user.id)` itself, and we make the duplicate
call free by adding Next.js's documented **Request Memoization** for non-`fetch`
data:

```ts
// src/lib/data/imports.ts
import { cache } from "react";

/**
 * … existing doc comment …
 *
 * Wrapped in React `cache()`: the app layout and the dashboard page render
 * in the same server request, so both call sites collapse to one DB round
 * trip. This is the App Router's supported alternative to prop-drilling
 * from a layout, which cannot pass props into `children`.
 */
export const getImportCount = cache(async (ownerUserId: string): Promise<number> => {
  /* body unchanged */
});
```

Net effect per dashboard request: **still exactly one `count(*)` query**, same
as today. No new data source (AC-OC3.1), no extra round trip. On a client-side
navigation where only the page segment re-renders, the page's own call runs
once — still one query.

The third entry joins the **existing** `Promise.all`, so it costs no additional
wall-clock latency; it does not serialize behind `getCryptoSummary`.

**Alternative considered and rejected:** await the two cheap signals first, then
`getDashboardData` only when not first-run. That would skip 8 queries for
first-run users but adds a serialized round trip for *every* returning user on
the app's most-visited page — a permanent cost to avoid a one-time waste.
(Related observation, out of scope: `getDashboardData` reads `quoteCache`,
`quoteHistory` and `fxRates` unfiltered — `dashboard.ts:70-73`. That is
pre-existing and untouched here; flagging it for a future perf pass, not fixing
it under a copy-and-empty-states AC.)

### 4.3 The predicate module

**New file:** `src/lib/onboarding/first-run.ts`

```ts
export type FirstRunSignal = {
  /** Statements ever ingested — `getImportCount`. */
  importCount: number;
  /** At least one Coinbase key connected — `getCryptoSummary().hasAccounts`. */
  hasCryptoAccounts: boolean;
};

/**
 * AC-OC3.1 — first run means the account has no data at all from EITHER
 * ingest path. A Coinbase-only user has zero imports but real positions and
 * must NOT see the first-run card (AC-OC3.6).
 */
export function isFirstRun(s: FirstRunSignal): boolean {
  return s.importCount === 0 && !s.hasCryptoAccounts;
}
```

A one-line function in its own module is deliberate: it is the AC's most
error-prone condition (the Coinbase-only case is an easy `||` slip), and this
is the only shape that lets a node-environment test cover the full truth table.

### 4.4 The card

**New file:** `src/components/onboarding/first-run-card.tsx` — a **server
component** (no `"use client"`, no hooks, no handlers): plain markup and two
`<a>` links, matching the in-repo precedent at `crypto/page.tsx:22-29`.

```tsx
export function FirstRunCard() {
  return (
    <main className="space-y-4">
      <Card>
        <h1 className="font-bold text-[26px] tracking-tight leading-tight">
          Let&apos;s get your data in.
        </h1>
        <p className="text-ink/90 leading-relaxed mt-2">
          Nothing here yet. Import a broker statement, or connect Coinbase, and
          this page fills in with your positions, dividends and tax draft.
        </p>
        <div className="flex flex-wrap gap-3 mt-5">
          {/* AC-OC3.3 — primary CTA */}
          <a href="/upload" className="bg-mint text-bg font-mono text-[11px] uppercase tracking-widest px-4 py-2.5 rounded-md font-semibold">
            Upload a statement
          </a>
          {/* AC-OC3.3 — secondary CTA, deep-linked (AC-OC1.7) */}
          <a href="/settings?section=crypto" className="border border-border text-muted hover:text-ink font-mono text-[11px] uppercase tracking-widest px-4 py-2.5 rounded-md">
            Connect Coinbase
          </a>
        </div>
        {/* AC-OC3.4 — the way back to the walkthrough after dismissal */}
        <p className="font-mono text-[11px] text-dim leading-relaxed pt-5">
          Not sure where to get a statement? Reopen the walkthrough any time
          from <span className="text-muted">?</span> in the top bar.
        </p>
      </Card>
    </main>
  );
}
```

AC-OC3.4 is satisfied by copy, not by a second trigger: the `?` button already
exists in the topbar (`TourTrigger`, `tour-host.tsx:56`), and pointing at it
keeps the card a server component. Re-exposing `TourCtx` here would force
`"use client"` on the dashboard's empty state for no user-visible gain.

AC-OC3.7 falls out for free: the card is derived purely from server data and
reads no `localStorage`, so it is already rendered underneath the auto-opened
tour and is still there after any dismiss path.

### 4.5 Why the returning-user path is provably unchanged (AC-OC0.5, AC-OC3.6)

The only edits below the early return are line 97's string (AC-OC3.5) and
nothing else. The hero, tiles, chart, donut, currency, dividends, top-positions
and `CryptoCard` JSX are not moved or reindented.

---

## 5. Tour navigation + analytics decoupling (AC-OC1.5, AC-OC0.4)

**New file:** `src/lib/onboarding/tour-next-action.ts`

```ts
import type { Platform } from "@/components/onboarding/platform-card"; // type-only, erased

export type TourNextAction = "upload" | "settings" | "explore";

/**
 * AC-OC0.4 — the value handed to `trackOnboardingTourCompleted`. This is an
 * analytics allow-list member and must stay one of the three literals, even
 * though the Coinbase destination URL gained a query string (AC-OC1.5).
 */
export function tourNextAction(selected: ReadonlySet<Platform>): TourNextAction {
  if (selected.has("ibkr") || selected.has("freedom")) return "upload";
  if (selected.has("coinbase")) return "settings";
  return "explore";
}

/**
 * AC-OC1.5 — where `finish()` navigates. Deliberately a SEPARATE function
 * from the analytics value: bare `/settings` defaults to `section=brokers`
 * (`settings/page.tsx:29`), which shows "No broker accounts yet" — the
 * opposite of the Coinbase user's task. `null` means "stay on this page".
 */
export function tourDestination(action: TourNextAction): string | null {
  switch (action) {
    case "upload":   return "/upload";
    case "settings": return "/settings?section=crypto";
    case "explore":  return null;
  }
}
```

`finish()` in `welcome-tour.tsx:94-106` becomes:

```ts
const finish = useCallback(() => {
  const nextAction = tourNextAction(selected);
  trackOnboardingTourCompleted(nextAction);   // AC-OC0.4 — unchanged literal
  closeTourState();
  const to = tourDestination(nextAction);      // AC-OC1.5
  if (to) router.push(to);
}, [closeTourState, router, selected]);
```

Splitting the two is the design's whole answer to AC-OC0.4: after this change
it is not *possible* to widen the analytics value by editing a URL, because the
event argument no longer flows from anything URL-shaped. No new events, no
signature change to `trackOnboardingTourCompleted`.

`/settings?section=crypto` needs **no change** on the settings side —
`settings/page.tsx:35,118-144` already fetches and renders
`CryptoAccountsManager` for `section === "crypto"`, and `"crypto"` is already in
`SETTINGS_SECTIONS` (`settings-sidebar.tsx:7`). AC-OC1.6 is satisfied by
existing behaviour; the developer should verify, not modify.

---

## 6. Coinbase instruction content (AC-OC1.1–1.4)

`BROKER_INSTRUCTIONS.coinbase`, as authored in the data module:

- **title:** `Connect Coinbase via API key`
- **lead:** `Crypto syncs live, not via file upload. You'll create a` **read-only** `CDP API key:`
- **steps:**
  1. **Coinbase Developer Platform** → **Portfolios** → **API keys** → **Create**.  *(AC-OC1.4, unchanged)*
  2. Permissions: **view only** (do not enable trade or send).  *(AC-OC1.4, unchanged)*
  3. When the key is created, Coinbase downloads a `` `.json` `` **file** — that file is the only thing you need.  *(AC-OC1.1)*
  4. …`coinbasePasteInstruction("elsewhere")` …  *(AC-OC1.2 + AC-OC1.3)*
- **notes:** `A daily sync then pulls trades, staking rewards and balances into` **§22** `(staking income) and` **§23** `(private sale) automatically.` *(unchanged)*

`coinbasePasteInstruction(where)` returns:

> Open the downloaded `.json` file in a text editor (Notepad, TextEdit — any
> editor), copy its **entire contents**, and paste all of it into the single
> **CDP Key JSON** box
> — then either ` on Settings → Crypto.` (`"elsewhere"`) or ` above.`
> (`"on-settings-crypto-page"`).

This is the one variable clause; every substantive word is single-sourced.
`"CDP Key JSON"` is the literal label rendered at
`crypto-accounts-manager.tsx:106`, so AC-OC1.3's "named exactly" is a
verifiable match, and there is exactly one input (AC-OC1.1's "not two values").

The strings `Copy the key + secret` and `Paste them` disappear from the
codebase with the old `CoinbaseCard` body (AC-OC1.3).

`ReadyCard` (`welcome-tour.tsx:419-423`) keeps its wording but turns
`Settings → Crypto` into a real link to `/settings?section=crypto`
(AC-OC1.7), and `crypto/page.tsx:26`'s `href="/settings"` becomes
`href="/settings?section=crypto"` (AC-OC1.7). Both are one-attribute edits;
neither is instruction prose, so neither belongs in the shared module.

---

## 7. Per-file change plan

| File | Change | AC |
|---|---|---|
| **NEW** `src/lib/onboarding/broker-instructions.ts` | The single authoring site: `CopySpan`, `InstructionSection`, `BROKER_INSTRUCTIONS`, `UPLOAD_INSTRUCTION_SECTIONS`, `coinbasePasteInstruction`, `spansToText` | OC0.2, OC1.1–1.4, OC1.8, OC2.4–2.7 |
| **NEW** `src/components/onboarding/instruction-copy.tsx` | `<Spans>` + `<InstructionBody>`; chrome-free | OC2.8 |
| **NEW** `src/lib/onboarding/first-run.ts` | `isFirstRun(signal)` | OC3.1, OC3.6 |
| **NEW** `src/lib/onboarding/tour-next-action.ts` | `tourNextAction()` / `tourDestination()` | OC0.4, OC1.5 |
| **NEW** `src/components/onboarding/first-run-card.tsx` | Server-component first-run card, 2 CTAs + `?` pointer | OC3.2–3.4, OC3.7 |
| **NEW** `src/components/pulse/export-instructions.tsx` | `"use client"` disclosure leaf | OC2.1–2.3, OC2.9, OC2.10 |
| `src/components/onboarding/welcome-tour.tsx` | `WelcomeCard` sentence (§2); `IbkrCard`/`FreedomCard`/`CoinbaseCard` bodies → `<InstructionBody>`; `finish()` → `tourNextAction`/`tourDestination`; `ReadyCard` link href | OC1.1–1.5, OC1.7, OC2.7, OC4.1–4.3 |
| `src/components/pulse/upload-dropzone.tsx` | **+1 import, +1 line** after `</label>`. Lines 179-187 (Revolut) untouched | OC2.1, OC2.9, OC2.10 |
| `src/components/pulse/crypto-accounts-manager.tsx` | Empty state (148-155) → `<Spans spans={coinbasePasteInstruction("on-settings-crypto-page")} />`; revocation note (197-203) untouched | OC1.8 |
| `src/app/(app)/page.tsx` | `getImportCount` into the existing `Promise.all`; early return `<FirstRunCard/>`; line 97 string | OC3.1–3.3, OC3.5, OC3.6 |
| `src/app/(app)/crypto/page.tsx` | `href="/settings"` → `href="/settings?section=crypto"` | OC1.7 |
| `src/lib/data/imports.ts` | Wrap `getImportCount` in React `cache()`; extend doc comment | OC3.1 |
| `src/app/(app)/layout.tsx` | **No change.** Keeps calling `getImportCount`; memoization makes the page's call free | OC3.1 |
| `src/app/(app)/settings/page.tsx`, `settings-sidebar.tsx` | **No change** — `?section=crypto` already works; verify only | OC1.6 |
| `src/lib/tax/**`, ledger, Anlage KAP/KAP-INV/SO | **No change** | OC0.3 |
| `src/lib/analytics-events.ts` | **No change** | OC0.4 |

---

## 8. Testability plan

Constraint restated: `vitest.config.ts:5` is `environment: "node"`,
`include: ["tests/**/*.test.ts"]`. No jsdom, no `@testing-library/react`, and
`.tsx` test files are not even collected. The module layout above exists
largely to make this a non-problem: everything the AC asserts is either a
**string in a `.ts` module** or a **pure predicate**, both directly importable.

### 8.1 `tests/onboarding/broker-instructions.test.ts` — real assertions

Imports the data module and asserts on `spansToText(...)`:

| Assertion | AC |
|---|---|
| `BROKER_INSTRUCTIONS.ibkr.steps` has length 4; joined text contains `Client Portal`, `Performance & Reports`, `Statements`, `Annual`, `CSV`, `Run`, `Download`; notes contain `Repeat for each year` | OC2.4 |
| ibkr footnote contains `Flex Query` and `Activity Statement` | OC2.5 |
| `BROKER_INSTRUCTIONS.freedom.steps` has length 4; text contains `Freedom24`, `Statements`, `All time`, `JSON`, `Download`; notes contain `2017xx_…_all.json`; footnote contains `CSV exports drop fields` | OC2.6 |
| coinbase text contains `.json`, `text editor`, `entire contents`, `CDP Key JSON`, `view only`, `Portfolios`, `API keys` | OC1.1–1.4 |
| coinbase text does **not** match `/Copy the key \+ secret\|Paste them/` | OC1.3 |
| `UPLOAD_INSTRUCTION_SECTIONS.map(s => s.id)` deep-equals `["ibkr","freedom"]`; joined text does not match `/revolut/i` | OC2.9 |
| `coinbasePasteInstruction("elsewhere")` and `("on-settings-crypto-page")` differ **only** in the trailing clause — assert both contain `entire contents` + `CDP Key JSON`, and that stripping the final span leaves identical text | OC1.8 |

### 8.2 `tests/onboarding/first-run.test.ts`

Full truth table for `isFirstRun`, one `it` each:
`(0,false)→true`; `(1,false)→false`; `(0,true)→false` *(the Coinbase-only user
named in AC-OC3.6)*; `(3,true)→false`.

### 8.3 `tests/onboarding/tour-next-action.test.ts`

- `tourNextAction(new Set(["coinbase"]))` === `"settings"` — the literal the
  analytics allow-list requires (OC0.4).
- `tourNextAction` for `ibkr`, `freedom`, `{ibkr,coinbase}`, `∅`.
- `tourDestination("settings")` === `"/settings?section=crypto"` (OC1.5);
  `"upload"` → `"/upload"`; `"explore"` → `null`.

### 8.4 `tests/onboarding/copy.test.ts` — source-text, per the `tests/auth/copy.test.ts` precedent

This file **must carry the same explanatory doc-comment** as
`tests/auth/copy.test.ts:6-29`: source-text assertions are a deliberate,
narrower substitute for a real render, and that rationale needs to be visible
to the next reader.

A small helper walks `src/` and returns `{ path, text }[]` (skipping
`node_modules`, `.next`), which lets the AC's own `rg`-based verification
column be expressed literally:

| Assertion | AC |
|---|---|
| `Flex Query`, `entire contents`, `All time` each appear in **exactly one** file, and that file is `src/lib/onboarding/broker-instructions.ts` | OC0.2, OC2.7 |
| No file under `src/` matches `/friends-only/i` | OC4.1 |
| No file under `src/` contains `history backfilling` | OC3.5 |
| No file under `src/` contains `Copy the key + secret` or `Paste them` | OC1.3 |
| `welcome-tour.tsx` still contains the two `WelcomeCard` bullets (`stocks, ETFs, bonds, dividends and crypto`; `Anlage KAP`/`Anlage SO`) and the `? in the top bar` footnote | OC4.3 |
| `crypto/page.tsx` contains `/settings?section=crypto` and no `href="/settings"` | OC1.7 |
| `welcome-tour.tsx` contains `/settings?section=crypto` — via `tourDestination` — and no bare `router.push("/settings")` | OC1.5, OC1.7 |
| `export-instructions.tsx` contains `aria-expanded`, `aria-controls`, `useState(false)`, `type="button"`; contains **no** `localStorage` | OC2.1–2.3 |
| In `upload-dropzone.tsx`, `indexOf("<ExportInstructions")` > `indexOf("</label>")` — the disclosure is outside the label | OC2.10 |
| `export-instructions.tsx` imports nothing from `./upload-queue` and contains no `addFiles`/`setQueue`/`setProcessing` | OC2.10 |
| `upload-dropzone.tsx` lines 179-187 region still contains the exact Revolut strings | OC2.9 |
| `welcome-tour.tsx` and `export-instructions.tsx` both reference `InstructionBody`, and neither contains `Flex Query` | OC2.7, OC2.8 |

### 8.5 Existing suites

`pnpm test` must be green with **no fixture edits**. The tax golden fixtures
(`tests/tax/gf-fixture-snapshot.test.ts` et al.) are the AC-OC0.3 evidence:
they pass unchanged because nothing they cover is touched.

### 8.6 Gap this design does **not** close — stated, not hidden

Nothing here proves the disclosure *renders* correctly, that `aria-expanded`
flips at runtime, or that a real click on the trigger does not open the file
picker. Those need a DOM. Two honest options, both out of scope for this
feature and to be raised by `tester`, not silently adopted:

1. Add `jsdom` + `@testing-library/react` (also unlocks the older AC-11/12/15
   UI-copy ACs that `tests/auth/copy.test.ts` already flags).
2. A Playwright e2e on `/upload` asserting trigger → `aria-expanded="true"` →
   "Flex Query" visible → no file dialog.

Until then, §3's *structural* choices (sibling of the label; state in the leaf;
native `<button>`) are what actually carry AC-OC2.3/2.10 — the tests only pin
those choices in place. That distinction is the point of designing it this way.

---

## 9. Security / GDPR / observability notes

- **No PII, no new data.** Every string added is static marketing/instruction
  copy; the only new value read is an integer count the layout already reads.
  No analytics event, property or allow-list changes (AC-OC0.4), so the
  data-minimization posture recorded in the analytics design doc §6 is
  unaffected. No entry needed in the data-lifecycle inventory.
- **No new attack surface.** No new route, no new API handler, no new form
  field, no `dangerouslySetInnerHTML` — the `CopySpan` renderer emits React
  elements from a module-level constant, so the copy is not user-influenced and
  cannot carry injection. External links get `rel="noreferrer"` +
  `target="_blank"`, matching `crypto-accounts-manager.tsx:151`.
- **`nextjs-security` floor:** `package.json:37` already pins
  `next: ">=15.2.3 <16.0.0"`, i.e. above the CVE-2025-29927
  (`x-middleware-subrequest`) floor. The root `CLAUDE.md` §5 note about
  `^15.1.0` is stale — worth a correction, but that is a docs edit outside this
  feature's diff and belongs to `documentation-writer`.
- **Observability:** deliberately none added. This feature has no runtime
  branch that can fail silently in a way a log would catch — `isFirstRun` is
  pure and its inputs are already whatever the dashboard renders. Adding an
  analytics event for "first-run card shown" would violate AC-OC0.4.

---

## 10. Risks & rollback

| Risk | Likelihood | Mitigation |
|---|---|---|
| AC-OC3.2 is a **visible behavioural change**: an existing user who deleted all imports and disconnected Coinbase now sees the first-run card instead of the zeroed dashboard | Low, and arguably the desired outcome | Called out explicitly here so it is a decision, not a surprise. Rollback is deleting the 4-line early return in `page.tsx`; `FirstRunCard` and `isFirstRun` can stay. |
| The disclosure's trigger opens the file picker because a later refactor moves it back inside `<label>` | Low | §8.4's index-order assertion fails the build if it happens |
| React `cache()` on `getImportCount` behaves unexpectedly on a runtime we haven't exercised | Low — it is the documented App Router idiom for non-`fetch` data, React 19 (`package.json:38`) | Worst case is one extra cheap `count(*)` per dashboard request, i.e. today's behaviour plus one; the feature is still correct. Rollback: drop the `cache()` wrapper, nothing else changes. |
| Copy refactor accidentally reflows the tour cards visually | Medium | `InstructionBody` reuses the existing `<ol>`/`<p>`/footnote classNames verbatim; `GuideCard` and all brand accent classes are untouched |
| Tailwind purges a class that only ever appears in the data module | None by construction | No Tailwind class names go in the data module — presentation stays in `.tsx` |

**Rollback as a whole:** every change is additive except six edited files, and
none of them alter data, schema, analytics or tax output. Reverting the commit
restores prior behaviour exactly; there is no migration and no persisted state
to unwind.

---

## 11. Build sequence for `developer` (TDD)

1. `src/lib/onboarding/broker-instructions.ts` + `tests/onboarding/broker-instructions.test.ts` (§8.1) — copy first, so §8.4's "exactly one authoring site" test is meaningful from the start.
2. `src/lib/onboarding/first-run.ts` + `tour-next-action.ts` and their tests (§8.2, §8.3).
3. `src/components/onboarding/instruction-copy.tsx`, then rewire `welcome-tour.tsx`'s three cards + `WelcomeCard` sentence + `finish()` + `ReadyCard` link.
4. `crypto-accounts-manager.tsx` empty state; `crypto/page.tsx` href.
5. `export-instructions.tsx`; mount in `upload-dropzone.tsx` (one line, after `</label>`).
6. `imports.ts` `cache()`; `first-run-card.tsx`; `page.tsx` early return + chart string.
7. `tests/onboarding/copy.test.ts` (§8.4) last — it is the cross-cutting gate.
8. `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
