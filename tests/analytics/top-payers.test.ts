import { describe, expect, it } from "vitest";
import { topDividendPayers } from "@/lib/analytics/top-payers";

describe("topDividendPayers", () => {
  it("returns empty array for empty input", () => {
    expect(topDividendPayers([])).toEqual([]);
  });

  it("single ticker aggregates multiple distributions", () => {
    const result = topDividendPayers([
      { ticker: "AAPL", amountEur: 50 },
      { ticker: "AAPL", amountEur: 75 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ ticker: "AAPL", totalEur: 125, count: 2 });
  });

  it("multiple tickers grouped and sorted by totalEur desc", () => {
    const result = topDividendPayers([
      { ticker: "MSFT", amountEur: 100 },
      { ticker: "AAPL", amountEur: 200 },
      { ticker: "MSFT", amountEur: 150 },
      { ticker: "GOOG", amountEur: 80 },
    ]);
    expect(result[0].ticker).toBe("MSFT"); // 250
    expect(result[0].totalEur).toBe(250);
    expect(result[1].ticker).toBe("AAPL"); // 200
    expect(result[2].ticker).toBe("GOOG"); // 80
  });

  it("ties broken by ticker ascending", () => {
    const result = topDividendPayers([
      { ticker: "ZZZ", amountEur: 100 },
      { ticker: "AAA", amountEur: 100 },
    ]);
    expect(result[0].ticker).toBe("AAA");
    expect(result[1].ticker).toBe("ZZZ");
  });

  it("default limit of 5 is respected", () => {
    const divs = Array.from({ length: 10 }, (_, i) => ({
      ticker: `T${String(i).padStart(2, "0")}`,
      amountEur: 100 - i,
    }));
    const result = topDividendPayers(divs);
    expect(result).toHaveLength(5);
  });

  it("custom limit is respected", () => {
    const divs = Array.from({ length: 10 }, (_, i) => ({
      ticker: `T${String(i).padStart(2, "0")}`,
      amountEur: 100,
    }));
    expect(topDividendPayers(divs, 3)).toHaveLength(3);
  });
});
