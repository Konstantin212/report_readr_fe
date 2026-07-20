import { useEffect } from "react";
import { PerfChart } from "report-readr-fe";
import { Frame } from "./_frame";

/**
 * Capture-harness workaround: recharts' Area/Line/Bar enter-animate over
 * ~1.5s (react-smooth, driven by real rAF timestamps). The capture
 * screenshot fires almost immediately after navigation, so without this the
 * chart is caught half-drawn. Keeping the network busy briefly delays
 * Playwright's `waitUntil: 'networkidle'` past the animation. See
 * .design-sync/learnings/charts.md — this is a global gap, not specific to
 * this component.
 */
function useHoldNetworkBusy(ms = 1900) {
  useEffect(() => {
    let stop = false;
    const href = typeof location !== "undefined" ? location.href : "";
    const tick = () => {
      if (stop) return;
      fetch(href, { cache: "no-store" }).catch(() => {});
      setTimeout(tick, 120);
    };
    tick();
    const timer = setTimeout(() => { stop = true; }, ms);
    return () => { stop = true; clearTimeout(timer); };
  }, [ms]);
}

// NOTE: sized wrappers below use inline `style` rather than Tailwind h-/w-
// classes. .design-sync/.cache/tailwind.css is a snapshot built once (by
// package-build.mjs, which we must not re-run) — `preview-rebuild.mjs` only
// recompiles the JS bundle, not CSS, so a class not already present in some
// src/ file at snapshot time (h-56, w-[480px], …) silently has no rule and
// the ResponsiveContainer collapses to 0 height. Inline style sidesteps
// this entirely. See .design-sync/learnings/charts.md.

// A plausible 90-day portfolio value curve vs. a benchmark (e.g. MSCI World),
// both starting indexed near 100, with a real drawdown and recovery.
const PORTFOLIO = [
  100, 100.8, 101.6, 100.9, 102.4, 103.1, 102.5, 104.0, 105.2, 104.6,
  106.1, 107.5, 106.8, 108.3, 107.6, 105.4, 103.2, 101.8, 103.5, 105.0,
  106.7, 105.9, 107.8, 109.4, 108.6, 110.5, 112.0, 111.2, 113.6, 115.1,
];
const BENCHMARK = [
  100, 100.4, 100.9, 100.6, 101.5, 102.0, 101.7, 102.6, 103.4, 103.0,
  104.1, 105.0, 104.6, 105.6, 105.2, 103.9, 102.6, 101.9, 102.8, 103.9,
  104.8, 104.3, 105.5, 106.6, 106.1, 107.3, 108.2, 107.7, 109.1, 110.0,
];

/** Canonical use: area style, single portfolio curve, as on a holding's detail view. */
export function Default() {
  useHoldNetworkBusy();
  return (
    <Frame>
      <div style={{ height: 224, width: 480 }}>
        <PerfChart values={PORTFOLIO} style="area" />
      </div>
    </Frame>
  );
}

// KNOWN COMPONENT LIMITATION (src/components/pulse/perf-chart.tsx, "area"
// branch): it composes `<Line dataKey="b">` as a sibling of `<Area>` inside
// recharts' <AreaChart>, but plain AreaChart (unlike <ComposedChart>) does
// not render foreign series types — the benchmark Line silently never
// mounts (confirmed via DOM: no .recharts-line node at all). "line" style
// puts both series through matching <Line> elements inside <LineChart>,
// which recharts does support, so that's the variant used here to actually
// demonstrate the benchmark-overlay feature. See learnings file.
/** Line style with benchmark overlay (dashed) — comparing a holding vs. an index. */
export function WithBenchmark() {
  useHoldNetworkBusy();
  return (
    <Frame>
      <div style={{ height: 224, width: 480 }}>
        <PerfChart values={PORTFOLIO} benchmark={BENCHMARK} style="line" strokeColor="#6FE8FF" />
      </div>
    </Frame>
  );
}

/** Bars style, negative-trend, e.g. monthly realized P&L. */
export function Bars() {
  useHoldNetworkBusy();
  const monthlyPnl = [820, 1_140, -430, 960, 1_320, -210, 680, -540, 1_050, 740, -180, 990];
  return (
    <Frame>
      <div style={{ height: 224, width: 480 }}>
        <PerfChart values={monthlyPnl} style="bars" strokeColor="#FF6F6F" />
      </div>
    </Frame>
  );
}
