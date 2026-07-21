# Changelog

Reverse-chronological record of shipped behavior/architecture changes. Each
entry captures **what** changed, **why**, **when**, and a link to the
driving spec/plan (see the `documentation-standards` skill's changelog
rules). This file is history, not the source of truth for current
behavior — for that, follow the links into `docs/INDEX.md`.

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
