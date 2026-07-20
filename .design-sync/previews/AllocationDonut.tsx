import { useEffect } from "react";
import { AllocationDonut } from "report-readr-fe";
import { Frame } from "./_frame";

/**
 * Capture-harness workaround: recharts' Pie enter-animates over ~1.5s
 * (react-smooth, driven by real rAF timestamps). The capture screenshot
 * fires almost immediately after navigation, so without this the donut ring
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

/**
 * Canonical composition: donut + legend + centered total, as used on the
 * /positions overview to show allocation by sector.
 */
export function Default() {
  useHoldNetworkBusy();
  const data = [
    { name: "Technology", pct: 38.2, value: 42_140 },
    { name: "Financials", pct: 21.7, value: 23_920 },
    { name: "Healthcare", pct: 14.0, value: 15_430 },
    { name: "Energy", pct: 9.4, value: 10_360 },
    { name: "Industrials", pct: 8.1, value: 8_930 },
    { name: "Cash", pct: 8.6, value: 9_480 },
  ];
  return (
    <Frame className="max-w-lg">
      <AllocationDonut data={data} centerLabel="110.260 €" centerSublabel="Total" />
    </Frame>
  );
}

/** No center label — legend-only reading, e.g. embedded in a compact card. */
export function NoCenterLabel() {
  useHoldNetworkBusy();
  const data = [
    { name: "VUSA", pct: 34.5 },
    { name: "VHYL", pct: 26.8 },
    { name: "SCHD", pct: 21.0 },
    { name: "SPYW", pct: 17.7 },
  ];
  return (
    <Frame className="max-w-md">
      <AllocationDonut data={data} colors={["#6FE8FF", "#7CFFB2", "#FFD24A", "#B59CFF"]} />
    </Frame>
  );
}

/** Currency exposure by broker account, more slices than the legend cap. */
export function CurrencyExposure() {
  useHoldNetworkBusy();
  const data = [
    { name: "EUR", pct: 44.2, value: 48_680 },
    { name: "USD", pct: 31.6, value: 34_820 },
    { name: "GBP", pct: 12.4, value: 13_660 },
    { name: "CHF", pct: 6.9, value: 7_600 },
    { name: "SEK", pct: 3.2, value: 3_530 },
    { name: "NOK", pct: 1.7, value: 1_870 },
  ];
  return (
    <Frame className="max-w-lg">
      <AllocationDonut data={data} centerLabel="110.160 €" centerSublabel="By currency" />
    </Frame>
  );
}
