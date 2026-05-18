import { describe, expect, it } from "vitest";
import { computeSectorContribution } from "@/lib/analytics/sector-contribution";

describe("computeSectorContribution", () => {
  it("returns empty array for empty input", () => {
    expect(computeSectorContribution([])).toEqual([]);
  });

  it("aggregates positions by sector and returns topSymbols", () => {
    const result = computeSectorContribution([
      { symbol: "AAPL", marketEur: 3000 },
      { symbol: "MSFT", marketEur: 2000 },
      { symbol: "GOOG", marketEur: 1000 },
      { symbol: "NVDA", marketEur: 500 },
      { symbol: "JPM", marketEur: 4000 },
    ]);
    const tech = result.find((r) => r.sector === "Tech");
    const fin = result.find((r) => r.sector === "Financials");
    expect(tech).toBeDefined();
    expect(tech!.valueEur).toBe(6500);
    expect(tech!.topSymbols).toEqual(["AAPL", "MSFT", "GOOG"]);
    expect(fin).toBeDefined();
    expect(fin!.valueEur).toBe(4000);
    expect(fin!.topSymbols).toEqual(["JPM"]);
    // sorted descending by value
    expect(result[0].sector).toBe("Tech");
    expect(result[1].sector).toBe("Financials");
  });

  it("unknown ticker maps to 'Other'", () => {
    const result = computeSectorContribution([{ symbol: "UNKNOWN123", marketEur: 500 }]);
    expect(result).toHaveLength(1);
    expect(result[0].sector).toBe("Other");
  });

  it("single sector → 100% of total", () => {
    const result = computeSectorContribution([
      { symbol: "AAPL", marketEur: 1000 },
      { symbol: "MSFT", marketEur: 1000 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].pctOfTotal).toBe(100);
  });

  it("skips null marketEur entries", () => {
    const result = computeSectorContribution([
      { symbol: "AAPL", marketEur: 1000 },
      { symbol: "MSFT", marketEur: null },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].valueEur).toBe(1000);
  });
});
