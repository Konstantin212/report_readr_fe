import { useEffect } from "react";
import { Donut } from "report-readr-fe";
import { Frame } from "./_frame";

const ASSET_CLASS_COLORS = ["#7CFFB2", "#FFD24A", "#FF5DA2", "#6FE8FF", "#B59CFF"];

/**
 * Capture-harness workaround: recharts' Pie/Area/Line/Bar all enter-animate
 * over ~1.5s (react-smooth, driven by real rAF timestamps — unaffected by
 * Playwright's fake Date). The capture script screenshots almost immediately
 * after navigation (`settle()` only awaits fonts + image decode), so without
 * this the raw shot is a half-drawn arc/line. Keeping the network busy for
 * ~1.9s delays Playwright's `waitUntil: 'networkidle'` past the animation,
 * with no capture-script edit required. See .design-sync/learnings/charts.md
 * — this is a global gap, not specific to this component.
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

/**
 * Bare Donut — portfolio split by asset class. `Donut` renders at a fixed
 * 140x140 via ResponsiveContainer, so it never needs a sized wrapper.
 */
export function Default() {
  useHoldNetworkBusy();
  const data = [
    { name: "Equities", pct: 58.4 },
    { name: "ETFs", pct: 27.1 },
    { name: "Bonds", pct: 9.8 },
    { name: "Cash", pct: 4.7 },
  ];
  return (
    <Frame>
      <Donut data={data} colors={ASSET_CLASS_COLORS} />
    </Frame>
  );
}

/** Two-slice split — dominant vs. rest, e.g. a concentration check. */
export function TwoSlice() {
  useHoldNetworkBusy();
  const data = [
    { name: "META", pct: 71.3 },
    { name: "Other holdings", pct: 28.7 },
  ];
  return (
    <Frame>
      <Donut data={data} colors={["#FF6F6F", "rgba(236,238,242,0.16)"]} />
    </Frame>
  );
}

/** Many slices — currency exposure across a broker's positions. */
export function ManySlices() {
  useHoldNetworkBusy();
  const data = [
    { name: "EUR", pct: 44.2 },
    { name: "USD", pct: 31.6 },
    { name: "GBP", pct: 12.4 },
    { name: "CHF", pct: 6.9 },
    { name: "SEK", pct: 4.9 },
  ];
  return (
    <Frame>
      <Donut data={data} colors={ASSET_CLASS_COLORS} />
    </Frame>
  );
}
