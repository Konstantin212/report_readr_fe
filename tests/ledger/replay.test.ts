import { describe, it, expect } from "vitest";
import { replay } from "@/lib/ledger/replay";
import { FIXTURE } from "../fixtures/ledger/simple-portfolio";

describe("FIFO replay", () => {
  const { lots, matches } = replay(FIXTURE);

  it("opens two lots then partially consumes the first", () => {
    expect(lots).toHaveLength(2);
    expect(lots[0].symbol).toBe("ASML");
    expect(Number(lots[0].remainingQty)).toBe(2);
    expect(Number(lots[1].remainingQty)).toBe(5);
  });

  it("emits one realized match", () => {
    expect(matches).toHaveLength(1);
    expect(Number(matches[0].qty)).toBe(8);
    // first lot: cost (incl fee) = 7001; 8/10 of that = 5600.8
    expect(Number(matches[0].costEur)).toBeCloseTo(5600.8, 1);
    // proceeds: 7200 - 1 = 7199, consumed entirely
    expect(Number(matches[0].proceedsEur)).toBeCloseTo(7199, 1);
    expect(matches[0].isLongTerm).toBe(true); // 2024-01-10 → 2025-04-04 = 450 days
  });
});
