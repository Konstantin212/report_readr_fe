/*
 * Design-sync bundle entry.
 *
 * Folio is an application, not a component library: there is no `dist/`, no
 * package `exports`, and no build that emits a component bundle. Left to its
 * own devices the converter synthesizes an entry with `export * from` every
 * file under src/ — which would drag in the data loaders, and with them
 * `getDb`, into a browser bundle.
 *
 * So this file is the entry instead: an explicit, hand-maintained list of the
 * presentational components that are safe to ship — no server imports, no
 * database, no `next/navigation` hooks that throw outside a router.
 *
 * DELIBERATELY EXCLUDED:
 *   BottomNav, BrokerFilter  — call next/navigation hooks (usePathname,
 *                              useSearchParams); they throw outside a Next.js
 *                              router context.
 *   Pagination               — imports next/link, which pulls Next's router
 *                              internals into the bundle. Those read
 *                              process.env.__NEXT_* at module init, so the
 *                              IIFE threw "process is not defined" before it
 *                              could assign window.Folio — taking down all 16
 *                              components, not just this one. Same root cause
 *                              as the two above: router-coupled components
 *                              aren't portable design-system parts. To ship it
 *                              here it would need its Link swapped for a
 *                              render-prop or an `as` prop.
 *   Everything in pulse/ that takes a domain type (ElsterValuesCard,
 *   LossHarvestPanel, PositionsSection, …) — these need the tax/portfolio
 *   engine behind them and are useless to a design agent without it.
 *
 * Adding a component here is not enough on its own: also pin it in
 * `.design-sync/config.json` → componentSrcMap, or it won't get a card.
 */

// ── Primitives ────────────────────────────────────────────────────────────
export { Button } from "../src/components/ui/button";
export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "../src/components/ui/table";

// ── Surfaces & metrics ────────────────────────────────────────────────────
export { Card } from "../src/components/pulse/card";
export { MetricTile } from "../src/components/pulse/metric-tile";
export { KpiStrip } from "../src/components/pulse/kpi-strip";
export { MetricsGrid } from "../src/components/pulse/metrics-grid";

// ── Data display ──────────────────────────────────────────────────────────
export { DataTable } from "../src/components/pulse/data-table";

// ── Charts & visualisations ───────────────────────────────────────────────
export { Donut } from "../src/components/pulse/donut";
export { AllocationDonut } from "../src/components/pulse/allocation-donut";
export { Sparkline } from "../src/components/pulse/sparkline";
export { Heatmap } from "../src/components/pulse/heatmap";
export { CurrencyBars } from "../src/components/pulse/currency-bars";
export { DividendMiniBars } from "../src/components/pulse/dividend-mini-bars";
export { DividendMonthlyBars } from "../src/components/pulse/dividend-monthly-bars";
export { PerfChart } from "../src/components/pulse/perf-chart";
