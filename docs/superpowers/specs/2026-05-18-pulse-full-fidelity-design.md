# Pulse Full-Fidelity — Design Spec

**Date:** 2026-05-18
**Status:** Draft for review
**Predecessor:** `2026-05-18-portfolio-tax-app-design.md` (foundation: ingest, ledger, KAP export)

## 1. Context and intent

The first deploy of `report-readr-fe` shipped the data backbone and a minimal-viable version of all seven Pulse screens. Real numbers reach the UI, sign-in works, the tax PDF downloads. What's missing: every screen renders one or two cards where the Pulse handoff defines 6–10 widgets. The screens look like scaffolding, not a finished product.

This spec closes that gap. It adds the analytics math (TWR, IRR, volatility, Sharpe, beta, max drawdown, sector contribution, yield-on-cost, projections), a historical-price pipeline (so we can chart a real equity curve and benchmark against the S&P 500), and the widget library that composes into each screen as designed.

### Source artifacts

- Design bundle: `C:\Users\Kostan\Downloads\test-handoff\test\project\` (Pulse direction A, files `direction-a.jsx`, `pulse-upload.jsx`, `pulse-analytics.jsx`, `pulse-positions.jsx`, `mock-data.jsx`).
- Current implementation: `src/app/(app)/*/page.tsx` + `src/lib/data/*.ts` + `src/components/pulse/*.tsx`.

### Out of scope (v2)

- Real-time / intraday quotes.
- Multi-currency display (reporting currency stays EUR per the foundation spec).
- Mobile-responsive layouts.
- Editable user-side "Add lot" flow (the button stays cosmetic in v2).
- ERiC submission.
- Hand-edit / corporate-action lot rebasing.
- Multi-user "send report to my Steuerberater" workflow.

### Captured user decisions (defaults baked into this spec)

- **Historical prices**: Yahoo Finance chart endpoint, daily resolution. Free, unofficial — same trust tier as the spot quotes we already pull.
- **Benchmark**: S&P 500 (`^GSPC`). Single benchmark for v2; configurable later.
- **Sector classification**: hand-maintained map for held tickers + "Other" fallback. No paid sector feed.
- **Risk-free rate**: 0% for Sharpe in v2. Realistic enough for retail dashboards; configurable later.
- **Performance time ranges**: server-side filtering via URL param `?range=1M|3M|6M|YTD|1Y|2Y|ALL`.
- **Broker filter**: URL param `?broker=all|ff|ibkr`. RSC reads, accessors filter.
- **Position detail panel**: URL param `?symbol=NVDA`. Server component splits the layout.
- **Search on positions**: client-side filter over the already-loaded list (5-user scale; full-text indexing is overkill).
- **Equity curve granularity**: monthly snapshots (24 months for the default range). Daily snapshots are computable but unnecessary for charts at this size.

## 2. Stack changes

Additions only; nothing replaces what's there.

| Component | Choice | Why |
|---|---|---|
| Quote history | Yahoo Finance chart endpoint via Vercel cron, cached in `quote_history` (new table) | Free, daily resolution, matches the spot-quote provider we already use |
| Analytics math | Pure functions in `lib/analytics/*` using decimal.js | Testable in isolation; no DB in the math layer |
| Heatmap rendering | Hand-rolled CSS grid (no Recharts dependency) | Recharts has no heatmap; the layout is trivial |
| Sparkline | Recharts `LineChart` with hidden axes (already a dep) | Reuse |

No new runtime deps required. We're at the cron limit (2 on Hobby) — the quote-history cron replaces / shares scheduling with the existing daily `/api/cron/quotes`. Solution: extend the existing quotes cron to also backfill missing daily history rows for held symbols.

## 3. System diagram (delta over v1)

```
                                            Vercel Fluid Compute (Node 24)
                                            ────────────────────────────────
RSC page                                    /api/cron/quotes (daily 21:00 UTC)
  read URL params (broker, range, symbol)     • fetch latest quote per symbol
  call lib/data/<screen>.ts                   • fetch daily history (last N missing days)
       │                                         per symbol + ^GSPC benchmark
       ▼                                      • upsert quote_cache + quote_history
  lib/data/<screen>.ts
       │  raw DB rows                        Neon Postgres (adds)
       ▼                                       quote_history (global)
  lib/analytics/*                              user_settings.benchmarkSymbol (default ^GSPC)
       │  derived metrics
       ▼
  pass props to Pulse widgets (RSC composition)
       │
       ▼
  components/pulse/*  ← server + client mix
```

The chain is one-way and DB-free past the data layer. Analytics + widget tests don't need a database.

## 4. Data model (delta)

Single migration adds two pieces.

### `quote_history` (new, global)

```ts
export const quoteHistory = pgTable(
  "quote_history",
  {
    symbol: text("symbol").notNull(),
    date: text("date").notNull(),         // ISO YYYY-MM-DD
    close: numeric("close").notNull(),
    currency: text("currency").notNull(),
    source: text("source").notNull().default("YAHOO"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.symbol, table.date] }),
    symbolDateIdx: index("quote_history_symbol_date_idx").on(table.symbol, table.date),
  }),
);
```

### `user_settings.benchmark_symbol`

Add a column for benchmark override (default `"^GSPC"`). This is the only schema change to existing tables.

## 5. Module map (delta only)

```
src/lib/analytics/             ← NEW
  equity-curve.ts              ← monthly portfolio-value series
  returns.ts                   ← TWR (time-weighted), MWR (IRR Newton-Raphson)
  risk.ts                      ← volatility, Sharpe, beta, max drawdown
  monthly-heatmap.ts           ← year×month return matrix
  sector-contribution.ts       ← per-sector P&L share
  currency-exposure.ts         ← group market value by currency
  dividend-projection.ts       ← linear extrapolation from declared rates
  yield-on-cost.ts             ← TTM dividends / total cost basis
  top-payers.ts                ← group dividends by symbol, sort by total
  sector-map.ts                ← hand-maintained ticker → sector
  benchmark.ts                 ← load benchmark series from quote_history
  __tests__ → tests/analytics/* (parallel)

src/lib/quotes/
  history.ts                   ← NEW: Yahoo /v8/finance/chart fetcher
  (update yahoo.ts/cron route to also call history)

src/lib/data/                  ← extend
  dashboard.ts                 ← add equity curve, allocation, currency, dividends-ytd, top positions
  performance.ts               ← add risk metrics, heatmap, sector contribution
  positions.ts                 ← add sector/broker filter, detail panel data
  dividends.ts                 ← add yield-on-cost, projection, upcoming, top payers, monthly
  tax.ts                       ← add net-realized, taxable-base, est-tax, FX adjustments tile data
  settings.ts                  ← add notifications/appearance toggles read+write
  upload.ts                    ← NEW: parsing-progress shape (sse?) — see § 6.7

src/components/pulse/          ← extend
  sparkline.tsx                ← NEW
  heatmap.tsx                  ← NEW
  allocation-donut.tsx         ← NEW (wraps donut.tsx with legend)
  currency-bars.tsx            ← NEW
  kpi-strip.tsx                ← NEW (multi-metric row, sized for hero)
  broker-filter.tsx            ← NEW (URL-param pills; client component)
  range-picker.tsx             ← NEW (URL-param pills)
  position-detail-panel.tsx    ← NEW
  top-payers-list.tsx          ← NEW
  upcoming-list.tsx            ← NEW
  progress-bar.tsx             ← NEW (Sparer-Pauschbetrag gauge etc.)
  dividend-monthly-bars.tsx    ← NEW
  broker-connector-card.tsx    ← NEW
  parsing-progress.tsx         ← NEW (client component, shown during upload)
  settings-sidebar.tsx         ← NEW

src/app/(app)/                 ← rewrite each page composing the above
  page.tsx                     ← Dashboard
  performance/page.tsx
  positions/page.tsx           ← + ?symbol={ticker} routing
  dividends/page.tsx
  tax/[year]/page.tsx
  settings/page.tsx
  upload/page.tsx
  layout.tsx                   ← + broker filter pills in topbar

src/app/api/cron/quotes/route.ts  ← extend to backfill quote_history
```

Every analytics module follows the same shape: **pure function**, takes typed inputs, returns typed outputs, no DB. The data accessor calls Drizzle and then hands rows to analytics.

## 6. Critical flows

### 6.1 Quote-history backfill

The existing daily `/api/cron/quotes` already fetches today's closing prices for every distinct held symbol. Extend it:

1. Collect distinct `(symbol, currency)` from `positions` plus the configured benchmark symbol (`^GSPC`).
2. For each symbol, query `quote_history` for the latest `date` we have.
3. If gap ≥ 1 day OR row missing: fetch Yahoo `/v8/finance/chart/{symbol}?range=2y&interval=1d` (capped at 2 years history; enough for the longest UI range).
4. Bulk upsert into `quote_history` ON CONFLICT(symbol,date) DO UPDATE close, updatedAt.

This bounds cron runtime: ≤ 30 distinct symbols × ~1 KB JSON each, well under the 300 s function limit. Yahoo rate-limit (~100 req / 15 min anonymous) is comfortable.

### 6.2 Equity curve

`computeEquityCurve({ lots, transactions, quoteHistory, currency: 'EUR' }) → { date, value }[]`

Algorithm:
1. Sort all events by date.
2. Walk events month by month. For each month-end, snapshot:
   - Per-symbol open quantity (from running FIFO replay state).
   - Per-symbol month-end close from `quote_history` (USD/HKD/etc.) × ECB rate for that date → EUR value.
   - Sum across symbols → portfolio value.
3. Return monthly series indexed to the first month.

This is a pure function over already-loaded rows. The data accessor pulls the rows; analytics derives the series.

### 6.3 Risk metrics

Input: monthly portfolio returns array, optional monthly benchmark returns array, optional risk-free rate (default 0).

- **TWR**: `product(1 + r_i) - 1` over the period. Annualized only when the period spans ≥ 30 days as `(cumulative + 1)^(365 / days) - 1`. For shorter periods, return the un-annualized cumulative.
- **MWR / IRR**: Newton-Raphson over (cashflow, date) pairs. Implementation in `returns.ts` with a 30-iteration cap; falls back to TWR if no convergence.
- **Volatility**: `stddev(monthly_returns) × √12`.
- **Sharpe**: `(TWR - rf) / volatility`.
- **Beta**: `cov(portfolio_returns, bench_returns) / var(bench_returns)`.
- **Max drawdown**: walk the equity curve, track running peak, return `min((value/peak) - 1)`.

Edge cases unit-tested:
- Empty series → all metrics zero (not NaN).
- Single month → volatility 0, Sharpe 0.
- All-positive returns → drawdown 0.
- Constant returns → volatility 0; Sharpe undefined (return 0).

### 6.4 Sector classification

`sector-map.ts` exports a frozen `{ symbol: string → sector: string }` covering the ~50 symbols a 3–5 user app realistically holds. Unrecognized → "Other".

```ts
export const SECTOR_MAP: Record<string, string> = {
  NVDA: "Tech", AAPL: "Tech", MSFT: "Tech", GOOG: "Tech", GOOGL: "Tech",
  META: "Tech", ASML: "Tech", AMD: "Tech", TSM: "Tech", "0700": "Tech",
  JPM: "Financials", BAC: "Financials", "BRK-B": "Financials", BNP: "Financials",
  LLY: "Healthcare", "NOVO-B": "Healthcare", JNJ: "Healthcare", PFE: "Healthcare",
  NESN: "Consumer", COST: "Consumer", PG: "Consumer", KO: "Consumer",
  XOM: "Energy", SHEL: "Energy", CVX: "Energy",
  GE: "Industrials", RHM: "Industrials",
  TSLA: "Consumer", BMW: "Consumer", VOW3: "Consumer",
  // … expand as user uploads more
};
```

Future enhancement: pull `industry`/`sector` from Yahoo `quoteSummary` and cache in `instruments` table. v3 work.

### 6.5 URL-driven filters

Every screen accepts URL search params and re-reads on change. Server Components handle this natively via `searchParams`.

- `?broker=all|ff|ibkr` — applies to Positions, Dividends, Performance, Dashboard.
- `?range=1M|3M|6M|YTD|1Y|2Y|ALL` — applies to Performance hero chart and risk metrics.
- `?symbol=NVDA` — Positions detail panel.
- `?sector=Tech` — Positions filter.

The broker filter pills + range picker are tiny Client Components that call `useRouter().replace('?broker=ff')`. Owner isolation is unchanged.

### 6.6 Tax page (closure)

Three big numbers up top come from a new accessor `getTaxHero(ownerUserId, year)`:

- `netRealized` = Σ realized_matches.gainEur for the year.
- `taxableBase` = max(0, netRealized + dividendsGross - saverAllowance).
- `estTax` = taxableBase × 0.26375 (25 % AbgSt + 5.5 % SolZ).

`Sparer-Pauschbetrag progress` bar = clamp(dividendsGross / saverAllowance, 0..1).
`FX adjustments` tile = Σ over events where `fxSource='ECB'` AND `raw.brokerEurAmount` exists, of `(amountEur - raw.brokerEurAmount)`. For IBKR statements that report base-currency totals, this is the per-event delta between our ECB conversion and IBKR's own EUR figure. When the broker did not report an EUR equivalent, the event contributes 0 to the tile.

### 6.7 Upload screen polish

The Pulse design's "parsing progress" panel shows step-by-step (extract pages, parse trades, FX lookup, classify lots). Our parser runs synchronously in a Web Worker — no progress events. v2 fakes this with a simple animated checklist driven by phases:
1. "decoding bytes" → "parsing structure" → "extracting events" → "computing fingerprints" → "uploading".
2. The dropzone client component dispatches phase changes locally via `useState`, advances them on `worker.postMessage`/`onmessage` boundaries.

Broker connector cards stay informational ("Manual PDF uploads" / "Flex Query (auto-sync)") — we don't actually wire Flex API integration in v2.

## 7. Per-screen wiring summary

### Dashboard
- `getDashboardData(ownerId, broker)` returns:
  ```ts
  { hero: { value, dayChange, dayPct, totalReturn, totalReturnPct, positionCount, cash }, 
    equityCurve: { dates: string[], portfolio: number[], benchmark: number[] },
    allocation: { name, pct, value }[],
    currency: { code, pct, value, flag }[],
    dividendsYtd: { totalEur, byMonth: number[] },
    topPositions: PositionRow[] }
  ```
- Page composes: `KpiStrip` + 2× `MetricTile` + `PerfChart` + `AllocationDonut` + `CurrencyBars` + dividends mini-card + positions preview.

### Performance
- `getPerformanceData(ownerId, broker, range)` returns:
  ```ts
  { hero: { portfolioReturnPct, benchmarkReturnPct, alphaPct, label },
    equityCurve, metrics: { twr, mwr, vol, drawdown, sharpe, beta },
    heatmap: number[][], heatmapYears: string[],
    sectorContribution: { sector, pctChange, top: string[] }[] }
  ```
- Page composes: `RangePicker` + `KpiStrip` + `PerfChart` + 6× `MetricTile` + `Heatmap` + sector bars.

### Positions
- `getPositionsData(ownerId, broker, sector, symbol)` returns:
  ```ts
  { rows: PositionRow[], 
    selected?: { ...PositionRow, sparkline: number[], lots: Lot[], dividendsYtd: number, yieldOnCost: number, daysHeld: number } }
  ```
- Page: filter bar (`BrokerFilter`, `SearchInput`, sector pills), two-col grid (`positions table` | `PositionDetailPanel`).

### Dividends
- `getDividendsData(ownerId, broker)` returns:
  ```ts
  { hero: { ytdEur, yoyPct, distributionCount, whtPaidEur },
    yieldOnCost: { pct, targetPct },
    projection: { yearEur, next30Eur, next30Count },
    monthly: number[],
    upcoming: { date, ticker, amount, ccy }[],
    topPayers: { ticker, name, totalEur, yieldPct }[],
    rows: DividendRow[] }
  ```
- Page composes: hero + yield gauge + projection card + `DividendMonthlyBars` + `UpcomingList` + table + `TopPayersList`.

### Tax `[year]`
- `getTaxData(ownerId, year)` (extends current `loadTaxInputs`) returns:
  ```ts
  { hero: { netRealized, taxableBase, estTax },
    allowance: { used, total, fxAdjustmentsEur, whtPaidEur },
    lots: RealizedMatchRow[],
    kapDraft: GermanTaxDraft }
  ```
- Page composes: hero card + allowance card + lots table + KAP lines accordion (current numbers stay but become collapsible) + export buttons.

### Settings
- `getSettingsData(ownerId)` returns existing + appearance/notification flags + per-broker stats.
- Page composes: `SettingsSidebar` + section content (Account | Brokers | Tax/currency | Notifications | Appearance | Export).
- Save actions: Server Actions that update `user_settings`. Notifications and Appearance toggles persisted but inert in v2 (no email-send job yet).

### Upload
- Server page unchanged.
- Client `UploadDropzone` adds the `ParsingProgress` sub-component + replaces flat recent list with broker-colored rows + `BrokerConnectorCard`s above.

### Topbar
- Add `BrokerFilter` pills (URL-param) right of nav.
- Add search icon — rendered but inert (no click handler) in v2. v3 will wire a `cmdk`-style command palette.

## 8. Error handling (additions)

| Failure | Handling |
|---|---|
| Yahoo history endpoint times out for one symbol | Cron logs symbol + error, continues with others, retries next day. UI shows `—` for affected charts. |
| `quote_history` empty for a symbol | Equity curve falls back to last broker statement close × ECB rate × held qty for that month. Banner: "Price history backfilling — fuller charts after the next cron run." |
| Risk metrics on a single-month series | All metrics return 0; UI shows "—" instead of `0.00` so the user doesn't misread no-data as a real value. |
| Benchmark series missing | Hero chart hides the benchmark line; "vs S&P 500" label dropped. |
| User has no positions (fresh account) | Every screen shows the existing empty state. Analytics functions all return their zero-shapes. |

## 9. Testing strategy (additions)

Unit tests, one file per analytics module:
- `tests/analytics/equity-curve.spec.ts` — fixed-fixture roll-forward, leap year, mid-month buy, mid-month sell, FX-only month, empty history.
- `tests/analytics/returns.spec.ts` — TWR identity (all-zero returns → 0), TWR compounding, MWR Newton-Raphson convergence + fallback, empty input.
- `tests/analytics/risk.spec.ts` — volatility for known series, Sharpe with rf=0, beta for synthetic correlated/anticorrelated series, drawdown peak-trough, edge cases.
- `tests/analytics/sector-contribution.spec.ts` — per-sector aggregation + Other fallback for unknown ticker.
- `tests/analytics/currency-exposure.spec.ts` — multi-ccy aggregation, rounding.
- `tests/analytics/dividend-projection.spec.ts` — linear projection from partial year, zero history → zero projection.
- `tests/analytics/yield-on-cost.spec.ts` — basic ratio, zero cost guard.
- `tests/analytics/top-payers.spec.ts` — group + sort, ties broken by ticker.
- `tests/analytics/monthly-heatmap.spec.ts` — 24-month series → 2×12 matrix, missing month = 0.

Component sanity (no React Testing Library — keep weight low; visual is checked end-to-end):
- `tests/components/heatmap.spec.tsx` — renders a 2×12 grid given a fixture.
- `tests/components/broker-filter.spec.tsx` — clicking a pill calls `router.replace` with the right query.

Integration:
- `tests/integration/quote-history.spec.ts` — mock fetch returning Yahoo's chart shape, verify upserts.
- `tests/integration/dashboard-data.spec.ts` — seeded DB, expected response shape.

Updates to existing tests:
- `playwright/golden-path.spec.ts` — un-skip and extend: after import, assert allocation donut renders, performance metrics tile shows real numbers, dividends YTD ≥ 0.

## 10. Free-tier budget (re-check)

| Resource | Limit | Expected v2 | Headroom |
|---|---|---|---|
| Cron jobs | 2 / project | 2 (FX + quotes-with-history) | ✓ exact |
| Function duration | 300 s | quotes cron ≤ 10 s for 30 symbols | ✓ |
| Neon storage | 0.5 GB | + 30 symbols × 730 daily rows × ~80 B = ~1.8 MB total | ✓ |
| Vercel function invocations | 100k / day | unchanged | ✓ |

Adding `quote_history` is the only meaningful storage delta, and it's negligible.

## 11. Open items (deferred to v3)

- Real notifications (Resend daily summary).
- Editable lots (manual basis adjustments for splits/spin-offs that the parser doesn't auto-handle).
- Multi-benchmark comparison (NDX, DAX) — schema already supports via `user_settings.benchmark_symbol`.
- True parsing-progress signal (worker streams phase events back to UI).
- Sector classification from `instruments` table (cache Yahoo's `quoteSummary.assetProfile.sector`).
- Cross-broker dividend forecast (combine declared rates with held quantity).

## 12. Verification checklist (before declaring v2 done)

- [ ] All 10 analytics unit tests pass.
- [ ] Quote-history cron pulls and stores ≥ 730 rows for `^GSPC` on first run.
- [ ] Dashboard hero shows real portfolio value (not 0) after import + cron warm.
- [ ] Performance page hero chart renders both lines (portfolio + benchmark).
- [ ] All 6 risk metrics show numeric values (not "—") after 2+ months of history.
- [ ] Heatmap renders a 2×12 grid for a user with 24+ months of data.
- [ ] Positions detail panel opens when clicking a row; URL updates to `?symbol=…`.
- [ ] Dividends Yield-on-cost gauge fills proportional to actual yield.
- [ ] Tax hero shows net realized + estimated tax for the year.
- [ ] Settings sidebar navigates between sections without full page reload.
- [ ] Empty-state copy renders on every screen for a fresh sign-in.
- [ ] Playwright golden-path passes including the new assertions.
