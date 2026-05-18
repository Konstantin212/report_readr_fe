import { describe, it, expect } from "vitest";
import { derivePositions } from "@/lib/ledger/positions";
import type { Lot } from "@/lib/ledger/replay";

function lot(symbol: string, remainingQty: string, costEur: string, id = `${symbol}-lot`): Lot {
  return { symbol, openedAt: "2024-01-01", remainingQty, costEur, sourceEventId: id };
}

describe("derivePositions — aggregation", () => {
  it("empty lots returns []", () => {
    expect(derivePositions([])).toHaveLength(0);
  });

  it("single lot becomes one position with same qty and costEur", () => {
    const positions = derivePositions([lot("AAPL", "10", "1500.00")]);
    expect(positions).toHaveLength(1);
    expect(positions[0].symbol).toBe("AAPL");
    expect(positions[0].quantity).toBe("10");
    expect(positions[0].costEur).toBe("1500.00");
  });

  it("two lots of same symbol are summed into one position", () => {
    const positions = derivePositions([
      lot("MSFT", "5", "1000.00", "lot1"),
      lot("MSFT", "3", "700.00", "lot2"),
    ]);
    expect(positions).toHaveLength(1);
    expect(positions[0].symbol).toBe("MSFT");
    expect(positions[0].quantity).toBe("8");
    expect(positions[0].costEur).toBe("1700.00");
  });

  it("two different symbols stay as two positions", () => {
    const positions = derivePositions([
      lot("AAPL", "5", "500.00"),
      lot("GOOG", "2", "400.00"),
    ]);
    expect(positions).toHaveLength(2);
    const symbols = positions.map(p => p.symbol);
    expect(symbols).toContain("AAPL");
    expect(symbols).toContain("GOOG");
  });

  it("fractional share lots sum exactly (e.g. 2.5 + 3.7 = 6.2)", () => {
    const positions = derivePositions([
      lot("ETF", "2.5", "250.00", "lot-a"),
      lot("ETF", "3.7", "370.00", "lot-b"),
    ]);
    expect(positions).toHaveLength(1);
    expect(positions[0].quantity).toBe("6.2");
  });

  it("costEur is formatted to exactly 2 decimal places", () => {
    const positions = derivePositions([
      lot("SPY", "1", "333.333", "lot1"),
      lot("SPY", "1", "333.333", "lot2"),
    ]);
    expect(positions[0].costEur).toMatch(/^\d+\.\d{2}$/);
  });
});
