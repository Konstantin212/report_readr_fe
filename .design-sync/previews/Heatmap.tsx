import { Heatmap } from "report-readr-fe";
import { Frame } from "./_frame";
import type { HeatmapRow } from "@/lib/analytics/monthly-heatmap";

/**
 * Three tax years of monthly portfolio returns, including the current year
 * to date — the grid is wide (12 month columns + year gutter), so this
 * preview needs the `viewport` override to avoid being clipped/scrolled.
 */
export function Default() {
  const rows: HeatmapRow[] = [
    {
      year: 2024,
      months: [0.021, 0.015, -0.008, 0.032, -0.012, 0.041, 0.019, -0.025, 0.028, 0.011, 0.055, -0.014],
    },
    {
      year: 2025,
      months: [0.033, -0.019, 0.027, -0.041, 0.038, 0.022, -0.009, 0.016, 0.044, -0.031, 0.029, 0.052],
    },
    {
      year: 2026,
      months: [0.018, -0.006, 0.024, 0.037, -0.011, 0.029, 0.015, 0, 0, 0, 0, 0],
    },
  ];
  return (
    <Frame>
      <Heatmap rows={rows} />
    </Frame>
  );
}

/** A single closed tax year — the minimal non-empty shape. */
export function SingleYear() {
  const rows: HeatmapRow[] = [
    {
      year: 2025,
      months: [0.033, -0.019, 0.027, -0.041, 0.038, 0.022, -0.009, 0.016, 0.044, -0.031, 0.029, 0.052],
    },
  ];
  return (
    <Frame>
      <Heatmap rows={rows} />
    </Frame>
  );
}

/** A freshly imported account with fewer than two valuation points — nothing to compute a return from yet. */
export function Empty() {
  return (
    <Frame>
      <Heatmap rows={[]} />
    </Frame>
  );
}
