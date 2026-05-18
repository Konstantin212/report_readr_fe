import { describe, expect, it } from "vitest";
import { buildMonthlyHeatmap } from "@/lib/analytics/monthly-heatmap";

describe("buildMonthlyHeatmap", () => {
  it("returns empty array for empty input", () => {
    expect(buildMonthlyHeatmap([])).toEqual([]);
  });

  it("returns empty array for single point (no returns)", () => {
    expect(buildMonthlyHeatmap([{ date: "2024-01-31", valueEur: 1000 }])).toEqual([]);
  });

  it("one full year of 13 month-ends → 1 row with 12 returns", () => {
    // 13 points gives 12 month-to-month returns all within 2024 (Jan–Dec)
    const points = [
      { date: "2023-12-31", valueEur: 1000 },
      ...Array.from({ length: 12 }, (_, i) => {
        const month = String(i + 1).padStart(2, "0");
        return { date: `2024-${month}-28`, valueEur: 1000 + (i + 1) * 10 };
      }),
    ];
    const result = buildMonthlyHeatmap(points);
    // Returns attributed to 2024 (Jan–Dec)
    const row2024 = result.find((r) => r.year === 2024);
    expect(row2024).toBeDefined();
    expect(row2024!.months).toHaveLength(12);
    // Jan 2024 return: 1010/1000 - 1 = 0.01
    expect(row2024!.months[0]).toBeCloseTo(0.01, 3);
  });

  it("two years of data → two rows sorted ascending by year", () => {
    const points = [
      { date: "2023-12-31", valueEur: 1000 },
      { date: "2024-01-31", valueEur: 1100 },
      { date: "2024-02-29", valueEur: 1050 },
      { date: "2024-12-31", valueEur: 1200 },
      { date: "2025-01-31", valueEur: 1300 },
    ];
    const result = buildMonthlyHeatmap(points);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0].year).toBeLessThan(result[1].year);
    const row2024 = result.find((r) => r.year === 2024);
    expect(row2024).toBeDefined();
    expect(row2024!.months[0]).toBeCloseTo(0.1, 3); // Jan 2024: 1100/1000-1 = 0.1
  });

  it("gap in the middle → 0 for missing month, prior used for next return", () => {
    const points = [
      { date: "2024-01-31", valueEur: 1000 },
      { date: "2024-02-29", valueEur: 1100 },
      // March missing — no point means no return for March
      { date: "2024-04-30", valueEur: 1200 },
    ];
    const result = buildMonthlyHeatmap(points);
    const row = result.find((r) => r.year === 2024);
    expect(row).toBeDefined();
    expect(row!.months[2]).toBe(0); // March (index 2) = 0 (no point)
    // April return: 1200/1100 - 1 (computed from Feb to Apr consecutive points)
    expect(row!.months[3]).toBeCloseTo(1200 / 1100 - 1, 3);
  });
});
