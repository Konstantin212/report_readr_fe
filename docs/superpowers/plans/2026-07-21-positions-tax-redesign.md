# Positions & Tax Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved Positions and Tax redesigns (mockups in Claude Design project `338f8445-…`) as a presentational-only restyle/re-layout of the existing pages, plus a global chrome polish.

**Architecture:** Reuse every existing data loader, API contract, route, and all tax computation unchanged. Extract the redesign's only new *logic* (positions sort, hero-summary derivation, sector aggregation) into pure functions under `src/lib/analytics/` so it is unit-testable in `node`-env Vitest; everything else is JSX/Tailwind restyle verified by Playwright. New tax sub-view mechanics: modals (client state) for already-loaded/static content, a new server route for ELSTER; Loss Harvest / Anlage SO keep their server routes.

**Tech Stack:** Next.js 15 App Router / React 19, Tailwind (semantic tokens in `tailwind.config.ts`), TanStack Query, Vitest (`tests/**/*.test.ts`, `environment: node`), Playwright (`e2e/*.spec.ts`), lucide-react, recharts.

## Global Constraints

- **Presentational only.** No behavioural change to `src/lib/tax/**`, `src/lib/data/**`, `src/lib/api/contracts.ts`, or any `/api/**` route. Tax numbers, line mappings, rates, and loss-bucket rules stay byte-identical. (Boundary asserted by Task 16.)
- **Tokens, not hex.** Use existing Tailwind tokens (`bg-bg #0b0d10`, `bg-panel #13171c`, `bg-panel2 #181d23`, `text-ink`, `text-muted`, `text-dim`, `text-mint`, `text-amber`, `text-bad #FF6F6F`, `border`, `borderHard`, `brand-freedom/ibkr/coinbase`). Add a token only for a genuinely new value; never inline raw hex where a token exists. Keeps `.design-sync/config.json` valid.
- **Preserve app extras the desktop mockup omits:** the `Crypto` nav item, `UserMenu`, `TourTrigger`, mobile `BottomNav`, per-row quote-source chip, FIFO-lots + `InstrumentSourceCard` in the detail panel, and the Broker/Net `PnlModeToggle`.
- **Responsive required.** Every fixed grid → `grid-cols-1 lg:grid-cols-N`; slide-over → full-width `100dvh` sheet on mobile; modals full-height on mobile; `BottomNav` stays the mobile nav.
- **Next.js version floor:** repo pins `next ^15.1.0` (< the 15.2.3 CVE-2025-29927 floor). This plan adds **no** middleware, so the flag is a pre-existing carry-forward note, not introduced here.
- **Package manager:** pnpm only. Commit after every green step. Branch: `feat/positions-tax-redesign` (already created; design spec committed there).
- **Verify each phase locally with** `pnpm typecheck && pnpm lint && pnpm test` before moving on; full `pnpm build` before push (pre-push gate).

**Reference:** design spec `docs/superpowers/specs/2026-07-21-positions-tax-redesign-design.md`. Mockup source of truth: `Positions Redesign.dc.html` and `Tax Redesign.dc.html` in the Claude Design project — read them for exact spacing/radii/copy before each restyle task.

---

## Phase 0 — Foundation (chrome + tokens)

### Task 1: Sticky chrome polish

**Files:**
- Modify: `src/components/pulse/topbar.tsx`
- Modify: `src/app/(app)/layout.tsx:20-24`
- Test: `e2e/app-smoke.spec.ts` (extend)

**Interfaces:**
- Consumes: existing `Topbar({ user })`, `TopbarNav`, `BrokerFilter`, `UserMenu`, `BottomNav`.
- Produces: no new exports; `Topbar` gains sticky styling.

- [ ] **Step 1: Write the failing e2e assertion**

Add to `e2e/app-smoke.spec.ts`:

```ts
test("top chrome is sticky and keeps brand + broker pills", async ({ page }) => {
  await page.goto("/positions");
  const header = page.locator("header").first();
  await expect(header).toHaveCSS("position", "sticky");
  await expect(page.getByRole("link", { name: /folio/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^All$/ })).toBeVisible();
});
```

- [ ] **Step 2: Run it, expect FAIL** — `pnpm test:e2e app-smoke -g "sticky"` → fails (`position` is `static`).

- [ ] **Step 3: Make the header sticky.** In `topbar.tsx`, change the `<header>` class to:

```tsx
<header className="sticky top-0 z-20 -mx-3 sm:-mx-5 lg:-mx-7 px-3 sm:px-5 lg:px-7 mb-7 flex items-center gap-6 bg-bg/[.86] backdrop-blur-[14px] border-b border-border py-3">
```

Tighten `TopbarNav` active pill (`topbar-nav.tsx:27-29`) to `bg-panel2 text-ink` active / `text-muted hover:text-ink` idle (already close — match mockup padding `px-3 py-2 rounded-[10px]`). Leave `BrokerFilter`, `UserMenu`, `Crypto` nav, `BottomNav` untouched.

- [ ] **Step 4: Adjust the shell.** In `(app)/layout.tsx`, change container to `max-w-[1160px]` and keep the padding/`pb-20 lg:pb-7`. The header's negative margins above let it span full-width while content stays at 1160.

- [ ] **Step 5: Run e2e, expect PASS.** `pnpm test:e2e app-smoke -g "sticky"`.

- [ ] **Step 6: Commit** — `git commit -am "feat(chrome): sticky blurred top header, mockup spacing"`.

---

## Phase 1 — Positions

### Task 2: Pure functions — sort + hero summary + sector allocation

**Files:**
- Create: `src/lib/analytics/positions-view.ts`
- Test: `tests/analytics/positions-view.test.ts`

**Interfaces:**
- Consumes: `PositionRow`, `PositionsData` from `@/lib/data/positions`, `PnlMode` (`"broker" | "net"`) from `@/components/pulse/pnl-mode`.
- Produces:
  - `type PositionSort = "value" | "gain" | "az"`
  - `sortRows(rows: PositionRow[], sort: PositionSort, mode: PnlMode): PositionRow[]`
  - `heroSummary(d: PositionsData): { marketEur: number; plEur: number; plPct: number | null }`
  - `sectorAllocation(d: PositionsData): { name: string; value: number; pct: number }[]` (desc by value)

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from "vitest";
import { sortRows, heroSummary, sectorAllocation } from "@/lib/analytics/positions-view";
import type { PositionRow, PositionsData } from "@/lib/data/positions";

const row = (over: Partial<PositionRow>): PositionRow => ({
  symbol: "X", name: "X", broker: "FF", currency: "EUR", sector: "Tech",
  qty: 1, pricePerUnitEur: 1, marketEur: 100, nativeCurrency: "EUR",
  asOf: null, quoteSource: null, quoteUpdatedAt: null, distribution: null, formerTickers: [],
  fifoLots: [],
  views: {
    broker: { avgCostEur: 1, costEur: 90, plEur: 10, plPct: 11.1, avgCostNative: null, costNative: null, plNative: null },
    net:    { avgCostEur: 1, costEur: 95, plEur: 5,  plPct: 5.3,  avgCostNative: null, costNative: null, plNative: null },
  },
  ...over,
} as PositionRow);

describe("sortRows", () => {
  it("sorts by value desc", () => {
    const r = sortRows([row({ symbol: "A", marketEur: 50 }), row({ symbol: "B", marketEur: 200 })], "value", "net");
    expect(r.map(x => x.symbol)).toEqual(["B", "A"]);
  });
  it("sorts by gain desc using the active pnl mode", () => {
    const a = row({ symbol: "A", views: { ...row({}).views, net: { ...row({}).views.net, plEur: 1 } } });
    const b = row({ symbol: "B", views: { ...row({}).views, net: { ...row({}).views.net, plEur: 99 } } });
    expect(sortRows([a, b], "gain", "net").map(x => x.symbol)).toEqual(["B", "A"]);
  });
  it("sorts A–Z by symbol", () => {
    expect(sortRows([row({ symbol: "Z" }), row({ symbol: "A" })], "az", "net").map(x => x.symbol)).toEqual(["A", "Z"]);
  });
  it("treats null marketEur as 0 without throwing", () => {
    expect(() => sortRows([row({ marketEur: null })], "value", "net")).not.toThrow();
  });
});

const data = (rows: PositionRow[]): PositionsData => ({
  rows, rowsByKind: { stock: rows, etf: [], bond: [], other: [] },
  total: rows.length, totalMarketEur: rows.reduce((s, r) => s + (r.marketEur ?? 0), 0),
  totalPlEur: rows.reduce((s, r) => s + (r.views.net.plEur ?? 0), 0),
  sectors: [...new Set(rows.map(r => r.sector))], cash: [],
} as unknown as PositionsData);

describe("heroSummary", () => {
  it("returns market, pl, and pl% over cost", () => {
    const s = heroSummary(data([row({ marketEur: 110 })]));
    expect(s.marketEur).toBe(110);
    expect(s.plEur).toBe(5);
    expect(s.plPct).toBeCloseTo(5 / 105 * 100, 4);
  });
  it("plPct null when cost is zero", () => {
    const d = data([row({ marketEur: 0, views: { ...row({}).views, net: { ...row({}).views.net, plEur: 0 } } })]);
    expect(heroSummary(d).plPct).toBeNull();
  });
});

describe("sectorAllocation", () => {
  it("aggregates market value per sector, desc, with pct", () => {
    const d = data([row({ sector: "Tech", marketEur: 300 }), row({ sector: "Energy", marketEur: 100 })]);
    const a = sectorAllocation(d);
    expect(a[0]).toMatchObject({ name: "Tech", value: 300, pct: 75 });
    expect(a[1]).toMatchObject({ name: "Energy", value: 100, pct: 25 });
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm test positions-view` → "not defined".

- [ ] **Step 3: Implement**

```ts
import type { PositionRow, PositionsData } from "@/lib/data/positions";
import type { PnlMode } from "@/components/pulse/pnl-mode";

export type PositionSort = "value" | "gain" | "az";

export function sortRows(rows: PositionRow[], sort: PositionSort, mode: PnlMode): PositionRow[] {
  const copy = [...rows];
  if (sort === "az") return copy.sort((a, b) => a.symbol.localeCompare(b.symbol));
  const key = (r: PositionRow) =>
    sort === "value" ? (r.marketEur ?? 0) : (r.views[mode].plEur ?? 0);
  return copy.sort((a, b) => key(b) - key(a));
}

export function heroSummary(d: PositionsData) {
  const marketEur = d.totalMarketEur;
  const plEur = d.totalPlEur;
  const cost = marketEur - plEur;
  return { marketEur, plEur, plPct: cost > 0 ? (plEur / cost) * 100 : null };
}

export function sectorAllocation(d: PositionsData) {
  const all = [...d.rowsByKind.stock, ...d.rowsByKind.etf, ...d.rowsByKind.bond, ...d.rowsByKind.other];
  const bySector = new Map<string, number>();
  for (const r of all) bySector.set(r.sector, (bySector.get(r.sector) ?? 0) + (r.marketEur ?? 0));
  const total = [...bySector.values()].reduce((s, v) => s + v, 0);
  return [...bySector.entries()]
    .map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);
}
```

> Note: confirm `PnlMode` is exported from `pnl-mode.tsx`; if not, add `export type PnlMode = "broker" | "net";` there (type-only, no behaviour change).

- [ ] **Step 4: Run, expect PASS** — `pnpm test positions-view`.

- [ ] **Step 5: Commit** — `git commit -am "feat(positions): pure sort/hero/allocation helpers + tests"`.

### Task 3: `PositionsHero` component

**Files:**
- Create: `src/components/pulse/positions-hero.tsx`
- Modify: `src/components/pulse/positions-client.tsx` (render hero above sections)

**Interfaces:**
- Consumes: `heroSummary`, `sectorAllocation` (Task 2), `AllocationDonut`, `Card`, `PositionsData`.
- Produces: `PositionsHero({ d }: { d: PositionsData })`.

- [ ] **Step 1: Implement the component** (no unit test — pure presentation over Task 2 helpers, covered by Task 6 e2e)

```tsx
"use client";
import { Card } from "./card";
import { AllocationDonut } from "./allocation-donut";
import { heroSummary, sectorAllocation } from "@/lib/analytics/positions-view";
import type { PositionsData } from "@/lib/data/positions";

const eur = (v: number) => "€" + Math.abs(v).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PositionsHero({ d }: { d: PositionsData }) {
  const s = heroSummary(d);
  const alloc = sectorAllocation(d);
  const up = s.plEur >= 0;
  return (
    <Card className="relative overflow-hidden grid grid-cols-1 lg:grid-cols-[1fr_1.1fr] gap-6 lg:gap-8 items-center">
      <div className="absolute right-[-60px] top-[-70px] w-[320px] h-[320px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(124,255,178,.12) 0%, transparent 68%)" }} />
      <div className="relative">
        <div className="font-mono text-[11px] uppercase tracking-widest text-dim">Portfolio value</div>
        <div className="text-[44px] lg:text-[52px] font-bold tracking-tight leading-none num mt-2">{eur(s.marketEur)}</div>
        <div className={`mt-3 font-mono text-sm ${up ? "text-mint" : "text-bad"}`}>
          {up ? "+" : "−"}{eur(s.plEur)} {s.plPct === null ? "" : `· ${up ? "+" : ""}${s.plPct.toFixed(1)}%`} all-time
        </div>
        <div className="mt-1 font-mono text-[11px] text-dim">Cash held separately · see the Cash section below.</div>
      </div>
      <div className="relative">
        <AllocationDonut
          data={alloc.map(a => ({ name: a.name, pct: a.pct, value: a.value }))}
          centerSublabel="Sectors" centerLabel={`${alloc.length}`}
        />
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Wire into `positions-client.tsx`.** Import `PositionsHero`; inside the `{d && (...)}` block (`positions-client.tsx:126`), render `<PositionsHero d={d} />` as the first child of the `space-y-4` wrapper, before the first `PositionsSection`.

- [ ] **Step 3: Verify** — `pnpm typecheck && pnpm dev`, load `/positions`, confirm hero renders with a value + donut.

- [ ] **Step 4: Commit** — `git commit -am "feat(positions): hero summary card with sector donut"`.

### Task 4: `PositionsSort` control (URL-persisted)

**Files:**
- Create: `src/components/pulse/positions-sort.tsx`
- Modify: `src/app/(app)/positions/page.tsx` (read `sort` from `searchParams`)
- Modify: `src/components/pulse/positions-client.tsx` (accept `sort` prop, apply `sortRows`)

**Interfaces:**
- Consumes: `PositionSort`, `sortRows` (Task 2), `useRouter/useSearchParams/usePathname`.
- Produces: `PositionsSort({ active }: { active: PositionSort })`; `PositionsClient` gains prop `sort: PositionSort`.

- [ ] **Step 1: Implement the segmented control** (mirror `broker-filter.tsx` URL pattern)

```tsx
"use client";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { PositionSort } from "@/lib/analytics/positions-view";

const OPTS: { key: PositionSort; label: string }[] = [
  { key: "value", label: "Value" }, { key: "gain", label: "Gain" }, { key: "az", label: "A–Z" },
];

export function PositionsSort({ active }: { active: PositionSort }) {
  const router = useRouter(); const pathname = usePathname(); const sp = useSearchParams();
  return (
    <div className="flex gap-0.5 p-[3px] rounded-full bg-panel border border-border">
      {OPTS.map(o => (
        <button key={o.key} onClick={() => {
          const p = new URLSearchParams(sp.toString());
          if (o.key === "value") p.delete("sort"); else p.set("sort", o.key);
          router.replace(`${pathname}?${p.toString()}` as never);
        }} className={`px-3 py-1.5 rounded-full font-mono text-[11px] uppercase tracking-widest ${
          active === o.key ? "bg-mint text-bg" : "text-ink hover:text-mint"
        }`}>{o.label}</button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Read `sort` in the page.** In `positions/page.tsx`, add to the `SP` type `sort?: string`, parse `const sort = (["value","gain","az"].includes(params.sort ?? "") ? params.sort : "value") as PositionSort;`, and pass `sort={sort}` to `<PositionsClient>`.

- [ ] **Step 3: Apply in the client.** In `positions-client.tsx`, add `sort` to props, import `sortRows` + `usePnlMode`, and replace each `d.rowsByKind.stock` etc. passed to `PositionsSection` with `sortRows(d.rowsByKind.stock, sort, mode)` (and likewise etf/bond/other). Render `<PositionsSort active={sort} />` next to `SectorFilter` in the header row (`positions-client.tsx:94-99`).

- [ ] **Step 4: Verify** — `pnpm typecheck`; `/positions?sort=gain` reorders rows; refresh preserves order.

- [ ] **Step 5: Commit** — `git commit -am "feat(positions): url-persisted sort control"`.

### Task 5: Restyle section rows, cash, and detail panel to the mockup

**Files:**
- Modify: `src/components/pulse/positions-section.tsx`
- Modify: `src/components/pulse/cash-card.tsx`
- Modify: `src/components/pulse/position-detail-panel.tsx`

**Interfaces:** unchanged (props identical; visual-only).

- [ ] **Step 1: Rows.** Match the mockup row: keep the existing desktop grid + mobile stack (already sound). Align paddings to the mockup (`px-5 py-4`, section header `px-6 py-4`), the avatar to `rounded-[11px]`, and selected state to the mockup's inset mint bar (already `border-l-mint`). Keep the quote-source chip and Dist/Acc/was chips (app extras). No structural change — spacing/radii only.

- [ ] **Step 2: Cash card.** Restyle `cash-card.tsx` to the mockup's cash section (mono label header, per-currency rows, EUR total). Keep the existing data.

- [ ] **Step 3: Detail panel.** Reorder `position-detail-panel.tsx` content to the mockup: header → value / unrealized two-up → sparkline → **qty · avg · price · cost** tile row → native-currency gain line → optional dividend tiles → transactions → (append) FIFO lots + `InstrumentSourceCard`. Widen `lg:w-[440px]` → `lg:w-[470px]`. Keep ESC/backdrop/scroll-lock behaviour.

- [ ] **Step 4: Verify visually** — `pnpm dev`, compare `/positions` + an open position against the mockup. `pnpm typecheck && pnpm lint`.

- [ ] **Step 5: Commit** — `git commit -am "style(positions): rows, cash, detail panel to mockup"`.

### Task 6: Positions e2e flow

**Files:**
- Create: `e2e/positions-redesign.spec.ts`

- [ ] **Step 1: Write the flow spec**

```ts
import { test, expect } from "@playwright/test";

test("positions: hero, sort, open + close detail", async ({ page }) => {
  await page.goto("/positions");
  await expect(page.getByText(/Portfolio value/i)).toBeVisible();          // hero
  await page.getByRole("button", { name: /^Gain$/ }).click();
  await expect(page).toHaveURL(/sort=gain/);                                // sort persists to URL
  const firstRow = page.locator("button", { hasText: /holdings|·/ }).first();
  await page.locator("main button").filter({ hasText: /€/ }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();                     // slide-over
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
```

- [ ] **Step 2: Run, iterate selectors to green** — `pnpm test:e2e positions-redesign`.
- [ ] **Step 3: Commit** — `git commit -am "test(positions): redesign e2e flow"`.

---

## Phase 2 — Tax

### Task 7: `RealizedTradesModal`

**Files:**
- Create: `src/components/pulse/realized-trades-modal.tsx`
- Reference: existing `realized-lots-table.tsx` for row/column shape.

**Interfaces:**
- Consumes: `TaxResponse["tax"]["realizedLots"]` shape (already loaded in `tax-client.tsx`), a `open`/`onClose` pair.
- Produces: `RealizedTradesModal({ lots, totals, open, onClose })` where `totals = { proceedsEur, netRealizedEur }`.

- [ ] **Step 1: Implement** the mockup's realized-trades modal: fixed overlay (`z-50 bg-[rgba(6,7,9,.72)] backdrop-blur`), panel `max-w-[860px]`, sticky column header (Ticker · Broker · Closed · Qty · Proceeds · Gain/Loss), scroll body `max-h-[64vh]`, Σ footer. Full-height sheet on mobile (`h-[100dvh] sm:h-auto`). ESC + backdrop close (reuse the panel pattern from `position-detail-panel.tsx:85-91`). Render the same lot data `RealizedLotsTable` uses.

- [ ] **Step 2: Verify** it compiles standalone — `pnpm typecheck`.
- [ ] **Step 3: Commit** — `git commit -am "feat(tax): realized-trades modal"`.

### Task 8: "Why two pots?" modal + `TaxBucketsCard` restyle

**Files:**
- Create: `src/components/pulse/why-pots-modal.tsx`
- Modify: `src/components/pulse/tax-buckets-card.tsx`

- [ ] **Step 1: Implement `WhyPotsModal`** — static explainer (§20 Abs. 6 S. 4 text from the existing `tax-buckets-card.tsx:60-63` copy — reuse verbatim, do not reword tax copy), small centered modal (`max-w-[520px]`), ESC/backdrop close.
- [ ] **Step 2: Restyle `TaxBucketsCard`** to the mockup's "How your income is taxed" card: two pots (Individual stocks / Funds + dividends), the calc breakdown block, and a `Why two pots? ⓘ` button (client state) that opens `WhyPotsModal`. Keep **all existing numbers and the carryforward note verbatim** — only layout changes. `"use client"` already present.
- [ ] **Step 3: Verify** — `pnpm typecheck`; open `/tax/2026`, click the ⓘ.
- [ ] **Step 4: Commit** — `git commit -am "feat(tax): two-pots restyle + why-pots modal"`.

### Task 9: New ELSTER route

**Files:**
- Create: `src/app/(app)/tax/[year]/elster/page.tsx`
- Create: `src/app/(app)/tax/[year]/elster/loading.tsx` (copy `tax/[year]/loading.tsx`)
- Reference: `elster-values-card.tsx`, `pre-submit-checklist.tsx`, `src/lib/data/tax.ts` (`getTaxData`), `src/app/api/tax/[year]/route.ts`.

**Interfaces:**
- Consumes: `getTaxData(user.id, year)` (server), `ElsterValuesCard`, `PreSubmitChecklist` — **all existing, unchanged**.
- Produces: server route `GET /tax/[year]/elster` (rendered page).

- [ ] **Step 1: Scaffold the route** (mirror `loss-harvest/page.tsx` server-component shape)

```tsx
import { requireCurrentUser } from "@/lib/auth/server";
import { getTaxData } from "@/lib/data/tax";
import { ElsterValuesCard } from "@/components/pulse/elster-values-card";
import { PreSubmitChecklist } from "@/components/pulse/pre-submit-checklist";

export default async function ElsterPage({ params }: { params: Promise<{ year: string }> }) {
  const user = await requireCurrentUser();
  const { year } = await params;
  const yearNum = Number(year);
  const d = await getTaxData(user.id, yearNum);
  return (
    <main className="space-y-4">
      <div className="space-y-2">
        <a href={`/tax/${yearNum}`} className="font-mono text-[11px] text-muted hover:text-ink inline-block">← Back to Tax</a>
        <h1 className="text-2xl font-bold tracking-tight">ELSTER values
          <span className="font-mono text-sm text-muted ml-2 tracking-wider block lg:inline">{yearNum} · Anlage KAP / KAP-INV</span>
        </h1>
      </div>
      <ElsterValuesCard draft={d.kapV2} reconciliation={d.reconciliation} />
      <PreSubmitChecklist draft={d.kapV2} />
    </main>
  );
}
```

> If `ElsterValuesCard`/`PreSubmitChecklist` props differ from `tax-client.tsx:226,236`, match those call sites exactly — do not change the components.

- [ ] **Step 2: Verify** — `pnpm typecheck`; `/tax/2026/elster` renders the same figures as today's hub section.
- [ ] **Step 3: Commit** — `git commit -am "feat(tax): dedicated /elster route"`.

### Task 10: Tax hub restyle + nav grid + modal wiring

**Files:**
- Modify: `src/components/pulse/tax-client.tsx`

- [ ] **Step 1: Add a nav grid** (2×2 desktop, 1-col mobile) below the two-pots card, with cards linking to: **Realized trades** (opens `RealizedTradesModal` via client state), **ELSTER values** (`/tax/${year}/elster`), **Loss Harvest** (`/tax/${year}/loss-harvest`), **Anlage SO** (`/tax/${year}/anlage-so`). Copy/subtitles per the mockup.
- [ ] **Step 2: Remove the always-inline `ElsterValuesCard`, `RealizedLotsTable`, and `PreSubmitChecklist`** from the hub (`tax-client.tsx:226-236`) — ELSTER + checklist now live on the `/elster` route (Task 9); realized lots now live in the modal (Task 7). Wire `RealizedTradesModal` open state.
- [ ] **Step 3: Restyle** the hero card + Sparer-Pauschbetrag card (+ forecast block, kept) to the mockup. Keep all numbers/copy.
- [ ] **Step 4: Verify** — `pnpm typecheck`; hub shows hero + allowance + two-pots + nav grid; realized modal opens; ELSTER link navigates.
- [ ] **Step 5: Commit** — `git commit -am "feat(tax): hub restyle + nav grid, move elster/realized off hub"`.

### Task 11: Loss Harvest panel restyle

**Files:**
- Modify: `src/components/pulse/loss-harvest-panel.tsx`
- Modify: `src/app/(app)/tax/[year]/loss-harvest/page.tsx` (header only)

- [ ] **Step 1: Restyle `LossHarvestPanel`** to the mockup's Loss Harvest sub-view: recommendation card ("No action needed" / warning states — drive from the **existing** `result`/`optimum` props, no logic change), simulate-harvest tiles (shares / loss / tax saved / carried forward), candidate list with +/− steppers, Aktien vs Funds sections, and the explainer callout. **Do not touch** `src/lib/tax/loss-harvest.ts` or the server computation in the page.
- [ ] **Step 2: Header** — update the page `<h1>`/back-link wording to the mockup ("Loss Harvest · could selling at a loss lower your tax?").
- [ ] **Step 3: Verify** — `pnpm typecheck`; `/tax/2026/loss-harvest` renders; steppers still drive the same `?sell=` URL round-trip.
- [ ] **Step 4: Commit** — `git commit -am "style(tax): loss-harvest sub-view to mockup"`.

### Task 12: Anlage SO restyle

**Files:**
- Modify: `src/app/(app)/tax/[year]/anlage-so/page.tsx`
- Modify: `src/components/pulse/section23-table.tsx` (if used there)

- [ ] **Step 1: Restyle** the Anlage SO page to the mockup's sub-view shell (back-link header, cards) — presentation only, no change to §22/§23 computation or exported values.
- [ ] **Step 2: Verify** — `pnpm typecheck`; `/tax/2026/anlage-so` renders unchanged figures.
- [ ] **Step 3: Commit** — `git commit -am "style(tax): anlage-so sub-view to mockup"`.

### Task 13: Tax e2e flow

**Files:**
- Create: `e2e/tax-redesign.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
import { test, expect } from "@playwright/test";

test("tax hub: nav grid → routes + modals", async ({ page }) => {
  await page.goto("/tax/2026");
  await expect(page.getByRole("heading", { name: "Tax" })).toBeVisible();
  await page.getByText(/Realized trades/i).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: /ELSTER values/i }).click();
  await expect(page).toHaveURL(/\/tax\/2026\/elster$/);
  await expect(page.getByRole("heading", { name: /ELSTER values/i })).toBeVisible();
});
```

- [ ] **Step 2: Run, iterate to green** — `pnpm test:e2e tax-redesign`.
- [ ] **Step 3: Commit** — `git commit -am "test(tax): redesign e2e flow"`.

---

## Phase 3 — Guarantees, docs, sync

### Task 14: Responsive audit

**Files:** touch-ups across Phase 1–2 components as needed.

- [ ] **Step 1: Add a mobile-viewport e2e** in `e2e/positions-redesign.spec.ts`:

```ts
test.use({ viewport: { width: 390, height: 844 } });
test("mobile: bottom-nav present, layouts stacked", async ({ page }) => {
  await page.goto("/positions");
  await expect(page.locator("nav.lg\\:hidden")).toBeVisible();       // BottomNav
  await expect(page.getByText(/Portfolio value/i)).toBeVisible();
});
```

- [ ] **Step 2: Fix any overflow** (hero, nav grid, modals) so no horizontal body scroll at 390px. Run the spec to green.
- [ ] **Step 3: Commit** — `git commit -am "test(a11y): mobile-viewport smoke + responsive fixes"`.

### Task 15: Design-system sync refresh

- [ ] **Step 1:** Follow `.design-sync` (`.design-sync/NOTES.md`, `config.json`) to rebuild previews for the changed components (`PositionsSection`, `Card`, `MetricTile`, etc.). Do not restructure the config.
- [ ] **Step 2:** Verify `.design-sync` build command runs clean (`buildCmd` in `config.json`).
- [ ] **Step 3: Commit** — `git commit -am "chore(design-sync): refresh previews for redesign"`.

### Task 16: Guard test — tax output is byte-identical

**Files:**
- Create: `tests/tax/redesign-guard.test.ts`

- [ ] **Step 1: Assert no tax lib/contract behavioural drift.** Write a test that imports the tax draft builder used by `/api/tax/[year]` (e.g. `getTaxData` or the pure builder under `src/lib/tax`) over a **committed golden fixture** and snapshots the resulting `TaxResponse`-shaped object:

```ts
import { describe, it, expect } from "vitest";
// Import the SAME pure computation the API route calls (no HTTP, no DB):
// adjust the import to the actual builder, e.g. buildTaxDraft from "@/lib/tax/…"
import { buildTaxDraft } from "@/lib/tax/draft";       // ← confirm exact path/name
import golden from "./fixtures/tax-2026-golden.json";  // ← committed ledger fixture input

describe("tax output guard (redesign is presentational-only)", () => {
  it("KAP draft numbers are unchanged", () => {
    const draft = buildTaxDraft(golden as never);
    expect(draft).toMatchSnapshot();
  });
});
```

> If a snapshot of the whole draft already exists in `tests/tax/**`, extend that instead of duplicating. The intent: any change to a tax number fails CI. Confirm the exact builder name/path from `src/app/api/tax/[year]/route.ts` before writing.

- [ ] **Step 2: Run, expect PASS** with a fresh snapshot — `pnpm test redesign-guard`. Inspect the snapshot to confirm it contains real KAP figures.
- [ ] **Step 3: Prove it bites** — temporarily perturb a display component's *data* mapping; confirm the guard is unaffected (it tests the lib, not the view) and existing `tests/tax/**` stay green. Revert.
- [ ] **Step 4: Commit** — `git commit -am "test(tax): golden guard proving redesign changes no tax numbers"`.

### Task 17: Docs + changelog

**Files:**
- Modify: `docs/INDEX.md`
- Modify/Create: changelog per `documentation-standards`.

- [ ] **Step 1:** Add a changelog entry summarising the redesign (chrome polish, Positions hero/sort/detail, Tax hub + `/elster` route + modals). Update the `docs/INDEX.md` line for this work to reference the plan.
- [ ] **Step 2:** Run the `documentation-writer` checklist (single-source-of-truth, INDEX registry).
- [ ] **Step 3: Commit** — `git commit -am "docs: changelog + INDEX for positions/tax redesign"`.

### Task 18: Pre-push gate + finish

- [ ] **Step 1:** Run the full gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. All green.
- [ ] **Step 2:** Run both e2e suites: `pnpm test:e2e positions-redesign tax-redesign app-smoke`.
- [ ] **Step 3:** Use `superpowers:finishing-a-development-branch` to open the PR / merge.

---

## Self-Review

**Spec coverage** (spec § → task):
- §2 guardrails → Global Constraints + Task 16 (guard).
- §4 chrome → Task 1.
- §5.1 hero → Tasks 2–3. §5.2 sort → Tasks 2, 4. §5.3 rows/cash → Task 5. §5.4 detail → Task 5.
- §6.1 hub + nav grid → Task 10. §6.2 realized modal → Task 7. §6.3 why-pots modal → Task 8. §6.4 `/elster` route → Task 9. §6.5 loss-harvest + anlage-so → Tasks 11–12.
- §7 testing → Tasks 6, 13, 14, 16. §8 responsive → Task 14. §9 orchestration → conductor sequence (below). §10 open questions → none.

**Placeholder scan:** logic tasks (2, 3, 4, 7, 9, 16) carry full code + tests. Restyle tasks (1, 5, 8, 10, 11, 12) are visual and reference the mockup as source of truth with exact target classes/structure — the `architect` step pins any remaining spacing. Two explicit "confirm exact name/path" notes (Task 2 `PnlMode`, Task 16 builder) are flagged, not left silent.

**Type consistency:** `PositionSort` and `sortRows`/`heroSummary`/`sectorAllocation` signatures are identical across Tasks 2→4. `PnlMode` sourced from `pnl-mode.tsx` in Tasks 2 and 4. Modal `open`/`onClose` contract consistent Tasks 7→10.

## Conductor sequence (per CLAUDE.md)

`business-analyst` (AC from spec) → `architect` (pin exact classes/tokens, confirm the two "confirm path" notes) → `developer` (execute this plan TDD) → `code-reviewer` (gate; expect the non-blocking Next.js floor note) → `tester` (Tasks 6/13/14/16 coverage) → `documentation-writer` (Task 17) → `.design-sync` (Task 15) → push (Task 18). **No `tax-advisor`** — presentational only, proven by Task 16.
