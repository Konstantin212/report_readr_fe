# Positions & Tax Redesign — Design Spec

**Status:** Approved for planning
**Date:** 2026-07-21
**Source designs:** Claude Design project `338f8445-88d0-4060-b093-7dda84c93410`
— `Positions Redesign.dc.html`, `Tax Redesign.dc.html`
**Type:** UI redesign (full chrome adoption, responsive) — **presentational only**

## 1. Goal

Bring the two approved Claude Design mockups to production: a redesigned
**Positions** page and a redesigned **Tax** area (hub + Loss Harvest + ELSTER +
Anlage SO), plus a polish pass on the global app chrome. The redesign realises
the mockups' visual language and information architecture while reusing the
existing data layer, routes, and (critically) all tax computation unchanged.

The mockups and the app already share one dark design language
(`bg #0b0d10`, ink `#ECEEF2`, mint `#7CFFB2`, Geist sans+mono), so this is a
restyle / re-layout — not a re-theme.

## 2. Non-negotiable guardrails

This work is **presentational only**. It MUST NOT change behaviour in:

- `src/lib/tax/**` (loss-harvest, Anlage KAP/KAP-INV/SO, buckets, allowance)
- the event-sourced ledger and `src/lib/data/**` loaders
- `src/lib/api/contracts.ts` and any `/api/**` route
- computed tax numbers, line mappings, rates, or loss-bucket rules

Because no tax logic changes, this work **does not enter the tax
legal-correctness gate** and does **not** require the `tax-advisor` agent. The
boundary is asserted mechanically by a guard test (§7). If implementation ever
finds it *needs* to touch the above to land a visual, that is a scope change:
stop and re-brainstorm with `tax-advisor` inserted.

Design tokens: map every mockup hex onto the **existing semantic Tailwind
tokens** (`bg-bg`, `bg-panel`, `bg-panel2`, `text-ink`, `text-muted`,
`text-dim`, `text-mint`, `text-amber`, `text-bad`, `border`, `borderHard`).
Add tokens only for genuinely new values (e.g. a larger panel radius scale).
Raw inline hex is disallowed except where a token genuinely does not exist —
this keeps the `.design-sync` component map (`.design-sync/config.json`) valid.

## 3. Current state (what already exists)

- **Chrome** (`src/components/pulse/topbar.tsx`) already renders the mockup's
  shell: `folio.` mint-logo brand, horizontal `TopbarNav`, ALL/Freedom/IBKR
  `BrokerFilter` pills, `UserMenu`. App extras beyond the mockup: a `Crypto`
  nav item and a mobile `BottomNav` (`bottom-nav.tsx`, `lg:hidden`).
- **Positions** (`positions-client.tsx`) already implements the mockup's
  structure: grouped sections (`PositionsSection` Stocks / ETFs / Bonds /
  Other + `CashCard`), a right slide-over / mobile bottom-sheet
  `PositionDetailPanel` (`lg:w-[440px]`, `100dvh`) with on-demand React Query
  detail loading and a loading overlay. Header hosts `SectorFilter`.
- **Tax hub** (`tax-client.tsx`) is today one long scrolling page with
  everything inline: hero (`MetricsGrid`), Sparer-Pauschbetrag card (+ forecast
  block), two-pots `TaxBucketsCard`, `ElsterValuesCard`, `RealizedLotsTable`,
  `PreSubmitChecklist`, and out-links to `/tax/[year]/anlage-so` and
  `/tax/[year]/loss-harvest`.
- **Loss Harvest** (`src/app/(app)/tax/[year]/loss-harvest/page.tsx`) is a
  **server component** doing the §20 Abs. 6 Aktien/Sonstige split server-side,
  rendering `LossHarvestPanel`. **Anlage SO** is likewise a server route.

Net: Positions is a restyle + two additions; Tax is a re-architecture of the
hub's information architecture (compartmentalise) with restyles throughout.

## 4. Global chrome polish

Restyle `topbar.tsx` and the `(app)/layout.tsx` shell to the mockup:

- Header becomes **sticky** (`top-0 z-20`), `bg-bg/86 backdrop-blur-[14px]`,
  with a bottom hairline `border-border`.
- Nav pills and the broker-pill capsule tightened to the mockup's spacing and
  active-state styling (active nav = `bg-panel2 text-ink`; active broker pill =
  `bg-mint text-bg`).
- **Preserve** the `Crypto` nav item, `UserMenu`, `TourTrigger`, and the mobile
  `BottomNav`.
- Container rhythm aligned to the mockup (`max-w-[1160px]`, `px-7` at desktop),
  keeping the existing responsive padding at smaller breakpoints.
- Mobile: header collapses to brand + broker capsule + user menu; primary
  navigation remains the `BottomNav`.

## 5. Positions page

All changes live under `positions-client.tsx` and the pulse components it uses.

### 5.1 New: `PositionsHero`
Hero summary card (gated by a "show summary" flag, default on, matching the
mockup toggle):
- Portfolio value + all-time return (€ and %), **derived client-side from the
  already-loaded `positionsData` totals** — no new API, no new loader.
- Sector allocation **donut + legend** — reuse/adapt `AllocationDonut`.
- Cash note (e.g. margin cash held separately).
- Responsive: two-column at `lg`, stacked below.

### 5.2 New: `PositionsSort`
Segmented control `Value / Gain / A–Z`. Sorts the loaded rows client-side.
Persisted in the URL (like `SectorFilter`) so the choice survives navigation.

### 5.3 Restyle: section rows + cash
`PositionsSection` rows restyled to the mockup: mono badge, symbol + meta
(`sector · ccy [· Dist]`) + broker pill, sub-name line, value + `qty × price`,
P/L (€ and %), hover state, and a selected-row inset mint bar. `CashCard`
restyled to the mockup's cash section.

### 5.4 Restyle: `PositionDetailPanel`
Re-lay-out to the mockup's slide-over (470px): header (mono icon, symbol,
`broker · ccy · sector` badge, name, close) → value / unrealized two-up →
sparkline → qty · avg · price · cost tiles → native-currency gain →
optional dividend tiles (Div YTD / Div received / yield / days) → transactions.
**Keep** the app's richer content that the mockup omits — `InstrumentSourceCard`
and the FIFO-lots breakdown — appended additively; do not drop them.

## 6. Tax area

### 6.1 Hub `/tax/[year]` (`tax-client.tsx` restyle)
- Hero estimated-tax card: big estimated-tax figure, `DRAFT` badge, 3 stats
  (realized year / tax-free allowance / taxable allowance).
- Sparer-Pauschbetrag card: progress bar + breakdown chips + the existing
  forecast block (kept).
- Two-pots card: `TaxBucketsCard` restyled ("How your income is taxed",
  individual-stocks pot vs funds+dividends pot, calc breakdown).
- **New nav grid** (2×2 at desktop, 1-col mobile): Realized trades · ELSTER
  values · Loss Harvest · Anlage SO.

### 6.2 New: `RealizedTradesModal`
The mockup's realized-trades table rendered as a **modal** (data already present
in `TaxResponse`). Replaces the always-inline `RealizedLotsTable` on the hub.
Opened from the nav grid. Full-height sheet on mobile.

### 6.3 New: "Why two pots?" modal
Static explainer modal opened from the two-pots card.

### 6.4 New route `/tax/[year]/elster`
Server-rendered route that moves `ElsterValuesCard` **and** `PreSubmitChecklist`
off the hub into the mockup's dedicated ELSTER layout (format notes, Anlage KAP
lines, KAP-INV distributions/gains, pre-submit checklist). Deep-linkable; linked
from the hub nav grid. Reuses existing components/data; no new tax logic.

### 6.5 Restyle: Loss Harvest & Anlage SO (routes unchanged)
`/tax/[year]/loss-harvest` and `/tax/[year]/anlage-so` keep their **server
computation exactly as-is**. Restyle `LossHarvestPanel` (recommendation card,
simulate-harvest steppers, candidate list, funds note) and the Anlage SO page
to the mockups' sub-view layouts. Add `← Back to Tax` headers.

## 7. Testing

- **Vitest (unit):** positions sort logic; hero total/return derivation; modal
  open/close state; nav-grid link targets; ELSTER route render smoke.
- **Playwright (e2e):** Positions filter → sort → open detail slide-over → close;
  Tax hub → each sub-view/route; realized + two-pots modals; a mobile-viewport
  smoke asserting `BottomNav` present and layouts stacked.
- **Guard test (mandatory):** assert no behavioural diff in tax output — snapshot
  the `/api/tax/[year]` contract shape and a golden `TaxResponse`-driven render
  so a regression in any tax number fails the build. This is the mechanical
  proof of the §2 boundary.

## 8. Responsive strategy

Every fixed multi-column grid becomes `grid-cols-1 lg:grid-cols-N`; hero
two-column → stacked; slide-over → full-width `100dvh` sheet (already the
pattern); nav grid 2×2 → 1-col; modals → full-height on mobile. `BottomNav`
preserved as primary mobile navigation.

## 9. Agent orchestration (conductor sequence)

Per `CLAUDE.md`, the main session conducts:

1. `business-analyst` — turn this spec into Given-When-Then AC.
2. `architect` — component + token design doc (new components, token additions,
   file-level plan).
3. `developer` — TDD implementation (`react-best-practices`,
   `nextjs-best-practices`, `nextjs-security`).
4. `code-reviewer` — gate. Expected note: the repo pins Next.js `^15.1.0`
   (< the 15.2.3 CVE-2025-29927 floor); this redesign adds no middleware, so
   it's a **non-blocking** carry-forward flag, not introduced here.
5. `tester` — coverage incl. the §7 guard test.
6. `documentation-writer` — `docs/INDEX.md` entry + changelog.
7. `.design-sync` refresh, then push (pre-push gate: typecheck + lint + test +
   build).

**No `tax-advisor`** — presentational only; boundary asserted by the guard test.

## 10. Open questions

None. Resolved during brainstorming:
- Scope = full chrome adoption (C).
- Mobile = keep full responsive support (A).
- ELSTER = its own route.
- Realized trades + "why two pots" = modals.
- Loss Harvest + Anlage SO = existing server routes, restyled.
