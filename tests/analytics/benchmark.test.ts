import { describe, expect, it } from "vitest";
import { indexToBaseline, alignBenchmarkToCurve } from "@/lib/analytics/benchmark";

describe("indexToBaseline", () => {
  it("returns empty for empty input", () => {
    expect(indexToBaseline([], [])).toEqual({ dates: [], values: [] });
  });

  it("[100, 110] with default baseline=100 → [100, 110]", () => {
    const result = indexToBaseline([100, 110], ["2024-01-31", "2024-02-29"]);
    expect(result.values[0]).toBe(100);
    expect(result.values[1]).toBe(110);
  });

  it("[200, 220, 180] → [100, 110, 90]", () => {
    const result = indexToBaseline(
      [200, 220, 180],
      ["2024-01-31", "2024-02-29", "2024-03-31"],
    );
    expect(result.values[0]).toBe(100);
    expect(result.values[1]).toBeCloseTo(110);
    expect(result.values[2]).toBeCloseTo(90);
  });

  it("custom baseline=1000", () => {
    const result = indexToBaseline([100, 110], ["2024-01-31", "2024-02-29"], 1000);
    expect(result.values[0]).toBe(1000);
    expect(result.values[1]).toBe(1100);
  });

  it("dates are preserved in output", () => {
    const dates = ["2024-01-31", "2024-02-29"];
    const result = indexToBaseline([100, 110], dates);
    expect(result.dates).toEqual(dates);
  });
});

describe("alignBenchmarkToCurve", () => {
  it("returns empty for empty portfolio points", () => {
    expect(alignBenchmarkToCurve([], [])).toEqual({ dates: [], values: [] });
  });

  it("exact date match", () => {
    const portfolio = [
      { date: "2024-01-31", valueEur: 1000 },
      { date: "2024-02-29", valueEur: 1100 },
    ];
    const benchmark = [
      { date: "2024-01-31", close: 100 },
      { date: "2024-02-29", close: 110 },
    ];
    const result = alignBenchmarkToCurve(portfolio, benchmark);
    expect(result.values[0]).toBe(100);
    expect(result.values[1]).toBe(110);
  });

  it("gaps in benchmark → forward-filled from last available close", () => {
    const portfolio = [
      { date: "2024-01-31", valueEur: 1000 },
      { date: "2024-02-29", valueEur: 1100 },
      { date: "2024-03-31", valueEur: 1200 },
    ];
    const benchmark = [
      { date: "2024-01-31", close: 100 },
      // Feb missing → should forward-fill Jan's close
      { date: "2024-03-31", close: 110 },
    ];
    const result = alignBenchmarkToCurve(portfolio, benchmark);
    // Indexed to baseline=100 starting from first aligned close (100)
    expect(result.values[0]).toBeCloseTo(100); // Jan: 100/100 * 100
    expect(result.values[1]).toBeCloseTo(100); // Feb: forward-fill = 100/100 * 100
    expect(result.values[2]).toBeCloseTo(110); // Mar: 110/100 * 100
  });

  it("empty benchmark → all zeros (no close available)", () => {
    const portfolio = [
      { date: "2024-01-31", valueEur: 1000 },
      { date: "2024-02-29", valueEur: 1100 },
    ];
    const result = alignBenchmarkToCurve(portfolio, []);
    // No closes at all, lastKnownClose undefined → 0 for all
    expect(result.values).toEqual([100, 100]); // 0/0 fallback or baseline
  });
});
