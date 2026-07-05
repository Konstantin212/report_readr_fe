/**
 * Integration seam: prior SELLS must shift the loss-harvest FIFO front.
 *
 * The harvest math never sees raw purchase history — it sees the REMAINING
 * open lots produced by the ledger replay (partially-consumed lots keep a
 * proportionally reduced qty + costEur; fully-consumed lots disappear).
 * These tests run real events through replay() and feed the resulting lots
 * into fifoHarvestPrefix, locking in that:
 *   1. a partial sale of the oldest lot shrinks the harvestable prefix
 *      (that loss portion was already REALISED by the sale — harvesting it
 *      again would double-count);
 *   2. once the underwater front lots are fully sold, the position stops
 *      being a harvest candidate even though it once had a losing lot;
 *   3. the prefix starts at the oldest REMAINING lot, not the oldest buy.
 */
import { describe, it, expect } from "vitest";

import { replay } from "@/lib/ledger/replay";
import { fifoHarvestPrefix, type FifoLot } from "@/lib/tax/loss-harvest";
import type { NormalizedEvent } from "@/lib/domain/types";

function trade(id: string, date: string, qty: number, amountEur: number): NormalizedEvent {
  return {
    id,
    broker: "INTERACTIVE_BROKERS",
    accountNumber: "U00000000",
    type: "TRADE",
    date,
    currency: "EUR",
    symbol: "ETF1",
    isin: "IE0000000001",
    quantity: String(qty),
    amountEur: String(amountEur),
  } as NormalizedEvent;
}

/** Same mapping getPositionsData applies: remaining lots, oldest first. */
function toFifoLots(lots: ReturnType<typeof replay>["lots"]): FifoLot[] {
  return [...lots]
    .filter((l) => Number(l.remainingQty) > 0)
    .sort((a, b) => a.openedAt.localeCompare(b.openedAt))
    .map((l) => ({ qty: Number(l.remainingQty), costEur: Number(l.costEur) }));
}

// Base position: 10 @ €100 (lot 1, underwater at €80), then 10 @ €50
// (lot 2, profitable at €80). Untouched, the harvest prefix is lot 1:
// sell 10 → −€200 (covered by the existing lot-aware tests).
const BUY_HIGH = trade("b1", "2024-01-02", 10, -1000);
const BUY_LOW = trade("b2", "2025-06-01", 10, -500);

describe("loss harvest after prior sells (FIFO front shift)", () => {
  it("a partial sale of the losing front lot shrinks the harvestable prefix", () => {
    // Sell 5 → FIFO consumes half of lot 1. Remaining: 5 @ €500 + 10 @ €500.
    const { lots } = replay([BUY_HIGH, BUY_LOW, trade("s1", "2025-07-01", -5, 400)]);
    const fifo = toFifoLots(lots);
    expect(fifo).toEqual([
      { qty: 5, costEur: 500 },   // lot 1 remainder, proportional cost
      { qty: 10, costEur: 500 },
    ]);
    // Only the UNSOLD half of lot 1's loss is still harvestable:
    // 5 × €80 − €500 = −€100 (not the original −€200 — the other half was
    // already realised by the sale and lives in realized_matches).
    expect(fifoHarvestPrefix(fifo, 80)).toEqual({ qty: 5, lossEur: -100, costEur: 500 });
  });

  it("once the losing lots are fully sold, nothing is left to harvest", () => {
    // Sell 12 → all of lot 1 + 2 shares of lot 2. Remaining: 8 @ €400.
    const { lots } = replay([BUY_HIGH, BUY_LOW, trade("s1", "2025-07-01", -12, 960)]);
    const fifo = toFifoLots(lots);
    expect(fifo).toEqual([{ qty: 8, costEur: 400 }]);
    // 8 × €80 = €640 vs €400 cost → pure gain, no harvestable prefix.
    expect(fifoHarvestPrefix(fifo, 80)).toBeNull();
  });

  it("the prefix starts at the oldest REMAINING lot, not the oldest buy", () => {
    // Three lots: cheap (2023), expensive (2024), cheap (2025). Selling the
    // first 10 consumes the profitable 2023 lot entirely, so the FIFO front
    // becomes the underwater 2024 lot — and its FULL loss is harvestable
    // without selling through a gain first.
    const events = [
      trade("b0", "2023-03-01", 10, -400),   // 10 @ €40 — gain at €80
      BUY_HIGH,                               // 10 @ €100 — loss at €80
      BUY_LOW,                                // 10 @ €50 — gain at €80
      trade("s1", "2025-07-01", -10, 780),    // consumes the 2023 lot exactly
    ];
    const { lots } = replay(events);
    const fifo = toFifoLots(lots);
    expect(fifo).toEqual([
      { qty: 10, costEur: 1000 },
      { qty: 10, costEur: 500 },
    ]);
    expect(fifoHarvestPrefix(fifo, 80)).toEqual({ qty: 10, lossEur: -200, costEur: 1000 });
  });

  it("without the prior sell, the same three lots need to sell THROUGH the gain lot", () => {
    // Control for the test above: no prior sell → front is the cheap 2023
    // lot (+€400 at €80); the curve minimum is at qty 20 (+400 − 200 = +200
    // → never negative), so nothing is harvestable. This is the FIFO
    // reality check: the identical loss lot is unreachable while a big
    // enough gain lot sits in front of it.
    const { lots } = replay([trade("b0", "2023-03-01", 10, -400), BUY_HIGH, BUY_LOW]);
    expect(fifoHarvestPrefix(toFifoLots(lots), 80)).toBeNull();
  });
});
