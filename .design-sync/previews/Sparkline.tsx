import { useEffect } from "react";
import { Sparkline } from "report-readr-fe";
import { Frame } from "./_frame";

/**
 * Capture-harness workaround: recharts' Area enter-animates over ~1.5s
 * (react-smooth, driven by real rAF timestamps). The capture screenshot
 * fires almost immediately after navigation, so without this the area path
 * is caught half-drawn. Keeping the network busy briefly delays Playwright's
 * `waitUntil: 'networkidle'` past the animation. See
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
// src/ file at snapshot time (h-16, h-56, w-[480px], …) silently has no
// rule and the ResponsiveContainer collapses to 0 height. Inline style
// sidesteps this entirely. See .design-sync/learnings/charts.md.

// A plausible 30-session equity curve: steady climb, a mid-month drawdown,
// then a recovery — not a sine wave, not monotone noise.
const UPTREND = [
  100, 101.2, 100.6, 102.1, 103.4, 102.8, 104.5, 105.9, 105.1, 106.8,
  108.2, 107.4, 105.6, 103.1, 104.0, 106.3, 107.9, 109.5, 108.8, 110.6,
  112.1, 111.3, 113.5, 115.0, 114.2, 116.4, 117.8, 116.9, 118.7, 120.3,
];

// A drawdown series — a sharp selloff followed by a partial, choppy recover.
const DOWNTREND = [
  120.3, 118.7, 116.9, 117.8, 116.4, 114.2, 115.0, 113.5, 111.3, 112.1,
  110.6, 108.8, 109.5, 107.9, 106.3, 104.0, 103.1, 105.6, 107.4, 108.2,
  106.8, 105.1, 105.9, 104.5, 102.8, 103.4, 102.1, 100.6, 101.2, 100.0,
];

/** Canonical use: mint positive-trend sparkline sized for a KPI tile. */
export function Default() {
  useHoldNetworkBusy();
  return (
    <Frame>
      <div style={{ height: 64, width: 160 }}>
        <Sparkline values={UPTREND} />
      </div>
    </Frame>
  );
}

/** Negative-trend position, e.g. a losing holding row — uses the bad accent. */
export function Negative() {
  useHoldNetworkBusy();
  return (
    <Frame>
      <div style={{ height: 64, width: 160 }}>
        <Sparkline values={DOWNTREND} strokeColor="#FF6F6F" />
      </div>
    </Frame>
  );
}

/** Compact size, as used inline in a dense positions table row. */
export function Compact() {
  useHoldNetworkBusy();
  return (
    <Frame>
      <div style={{ height: 32, width: 96 }}>
        <Sparkline values={UPTREND.slice(-14)} strokeColor="#FFD24A" />
      </div>
    </Frame>
  );
}
