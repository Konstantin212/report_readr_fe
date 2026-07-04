/**
 * Share-split handling in the FIFO replay.
 *
 * Freedom Finance reports a split as a PAIR of CORPORATE_ACTION rows on the
 * same date+identity: a negative quantity (old shares removed) and a positive
 * quantity (new shares added). Before this fix, replay() skipped everything
 * that wasn't a TRADE, so a post-split sell FIFO-matched the PRE-split lots at
 * the un-split per-share cost and invented a large phantom realized loss.
 *
 * The golden case is the real SCHD position: 34 shares across five pre-split
 * lots, a 3:1 split (-34/+102) on 2024-10-11, a small post-split buy, and a
 * later sell of the whole 105-share position for a modest profit.
 */
import { describe, it, expect } from "vitest";
import { replay } from "@/lib/ledger/replay";
import type { NormalizedEvent } from "@/lib/domain/types";

const trade = (
  id: string,
  date: string,
  symbol: string,
  qty: string,
  amountEur: string,
): NormalizedEvent => ({
  id,
  broker: "FREEDOM_FINANCE",
  accountNumber: "TEST",
  type: "TRADE",
  date,
  currency: "USD",
  symbol,
  quantity: qty,
  amount: amountEur,
  amountEur,
});

const split = (
  id: string,
  date: string,
  symbol: string,
  qty: string,
  description = "split",
): NormalizedEvent => ({
  id,
  broker: "FREEDOM_FINANCE",
  accountNumber: "TEST",
  type: "CORPORATE_ACTION",
  date,
  currency: "USD",
  symbol,
  quantity: qty,
  description,
});

const sum = (xs: string[]) => xs.reduce((a, x) => a + Number(x), 0);

describe("FIFO replay — share splits (CORPORATE_ACTION pairs)", () => {
  it("golden SCHD 3:1 split: post-split sell realizes a small profit, not a phantom loss", () => {
    // 34 shares across five pre-split lots, total cost €2305.46.
    const events: NormalizedEvent[] = [
      trade("b1", "2023-06-14", "SCHD", "10", "666.94"),
      trade("b2", "2023-07-11", "SCHD", "8", "530.28"),
      trade("b3", "2023-08-08", "SCHD", "3", "204.19"),
      trade("b4", "2023-12-22", "SCHD", "8", "551.05"),
      trade("b5", "2024-01-23", "SCHD", "5", "353.00"),
      // Broker's 3:1 split pair: remove 34 old, add 102 new.
      split("ca-remove", "2024-10-11", "SCHD", "-34", "split"),
      split("ca-add", "2024-10-11", "SCHD", "102", "split"),
      // Post-split buy of 3 shares (dated after the split so it is not itself
      // split-adjusted — a same-day TRADE would sort before the CORPORATE_ACTION
      // and be incorrectly scaled). Total → 102 + 3 = 105 shares.
      trade("b6", "2024-10-14", "SCHD", "3", "77.86"),
      // Sell the whole 105-share position.
      trade("s1", "2025-11-11", "SCHD", "-105", "2464.84"),
    ];

    const { lots, matches } = replay(events);

    expect(lots).toHaveLength(0);
    expect(sum(matches.map((m) => m.qty))).toBe(105);

    const totalCost = sum(matches.map((m) => m.costEur));
    expect(totalCost).toBeCloseTo(2383.32, 2);

    const totalGain = sum(matches.map((m) => m.gainEur));
    expect(totalGain).toBeCloseTo(81.52, 1);
    expect(Math.abs(totalGain - 81.52)).toBeLessThanOrEqual(0.05);

    // Regression guard: the old bug produced a ~-€1531 phantom loss.
    for (const m of matches) {
      expect(Number(m.gainEur)).toBeGreaterThan(-100);
    }
  });

  it("reverse split (3:1 down) scales quantity down while preserving basis", () => {
    const events: NormalizedEvent[] = [
      trade("b1", "2024-01-01", "RVS", "30", "3000"),
      split("ca-remove", "2024-06-01", "RVS", "-30", "Split"),
      split("ca-add", "2024-06-01", "RVS", "10", "Split"),
      trade("s1", "2024-07-01", "RVS", "-10", "3500"),
    ];

    const { lots, matches } = replay(events);

    expect(lots).toHaveLength(0);
    expect(matches).toHaveLength(1);
    expect(Number(matches[0].qty)).toBe(10);
    // Cost basis is preserved through the reverse split.
    expect(Number(matches[0].costEur)).toBeCloseTo(3000, 2);
  });

  it("applies the split regardless of which leg sorts first", () => {
    // The positive (add) leg's id sorts before the negative (remove) leg's id.
    const events: NormalizedEvent[] = [
      trade("b1", "2024-01-01", "ORD", "34", "3400"),
      split("a-add", "2024-10-11", "ORD", "102", "split"),
      split("z-remove", "2024-10-11", "ORD", "-34", "split"),
      trade("s1", "2025-01-01", "ORD", "-102", "4000"),
    ];

    const { lots, matches } = replay(events);

    expect(lots).toHaveLength(0);
    expect(matches).toHaveLength(1);
    expect(Number(matches[0].qty)).toBe(102);
    expect(Number(matches[0].costEur)).toBeCloseTo(3400, 2);
  });

  it("ignores a lone split leg (only the remove row arrives)", () => {
    const events: NormalizedEvent[] = [
      trade("b1", "2024-01-01", "LON", "34", "3400"),
      split("ca-remove", "2024-10-11", "LON", "-34", "split"),
      // Sell of the untouched 34-share lot matches the original basis.
      trade("s1", "2025-01-01", "LON", "-34", "4000"),
    ];

    const { lots, matches } = replay(events);

    expect(lots).toHaveLength(0);
    expect(matches).toHaveLength(1);
    expect(Number(matches[0].qty)).toBe(34);
    expect(Number(matches[0].costEur)).toBeCloseTo(3400, 2);
  });

  it("does not crash when a split arrives for an identity with no open lots", () => {
    const events: NormalizedEvent[] = [
      split("ca-remove", "2024-10-11", "NONE", "-10", "split"),
      split("ca-add", "2024-10-11", "NONE", "30", "split"),
    ];

    const { lots, matches } = replay(events);

    expect(lots).toHaveLength(0);
    expect(matches).toHaveLength(0);
  });

  it("ignores non-split corporate actions (e.g. a dividend with no quantity)", () => {
    const events: NormalizedEvent[] = [
      trade("b1", "2024-01-01", "DIV", "10", "1000"),
      {
        id: "ca-div",
        broker: "FREEDOM_FINANCE",
        accountNumber: "TEST",
        type: "CORPORATE_ACTION",
        date: "2024-06-01",
        currency: "USD",
        symbol: "DIV",
        description: "Dividends",
        // no quantity
      },
      trade("s1", "2025-01-01", "DIV", "-10", "1100"),
    ];

    const { lots, matches } = replay(events);

    expect(lots).toHaveLength(0);
    expect(matches).toHaveLength(1);
    expect(Number(matches[0].qty)).toBe(10);
    // Quantity unchanged by the ignored dividend action.
    expect(Number(matches[0].costEur)).toBeCloseTo(1000, 2);
  });
});
