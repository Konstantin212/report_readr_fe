/**
 * Same-day buy+sell ordering regression.
 *
 * The PLTR zombie position bug: a user holds 22 shares bought on
 * 2022-07-25, sells 1 the same day, then sells the remaining 21 weeks
 * later. Net qty = 0. But because `runReplayForAccount` reconstructs
 * NormalizedEvent.id from the DB row UUID (random), the same-day buy
 * and sell sort in unpredictable order. When the sell lands first,
 * FIFO finds no lot to consume and the buy then creates a 22-share lot
 * that the later sell only partially closes — one share leaks through
 * as a phantom open position.
 *
 * Fix: replay() now sorts buys-before-sells on the same date via a
 * qty-sign tiebreaker, before falling through to id comparison.
 */
import { describe, it, expect } from "vitest";
import { replay } from "@/lib/ledger/replay";
import type { NormalizedEvent } from "@/lib/domain/types";

function trade(opts: {
  id: string;
  date: string;
  qty: number;        // positive = buy, negative = sell
  amountEur: number;  // absolute EUR amount
}): NormalizedEvent {
  return {
    id: opts.id,
    broker: "FREEDOM_FINANCE",
    accountNumber: "TEST",
    type: "TRADE",
    date: opts.date,
    currency: "USD",
    symbol: "PLTR",
    isin: "US69608A1088",
    quantity: opts.qty.toString(),
    amount: opts.amountEur.toString(),
    amountEur: opts.amountEur.toString(),
  };
}

describe("FIFO replay — same-day buy + sell ordering", () => {
  it("closes a same-day buy-then-sell sequence regardless of event id order", () => {
    // The ingest path replaces parser IDs with DB UUIDs. We simulate the
    // pathological case: the sell's id sorts BEFORE the buy's id.
    const events: NormalizedEvent[] = [
      trade({ id: "zzz-sell-1",  date: "2022-07-25", qty: -1,  amountEur: 9.73 }),
      trade({ id: "aaa-buy-22",  date: "2022-07-25", qty: 22,  amountEur: 212.08 }),
      trade({ id: "mid-sell-21", date: "2022-08-09", qty: -21, amountEur: 190.05 }),
    ];
    const { lots, matches } = replay(events);
    // 22 bought, 22 sold → zero open lots.
    expect(lots.length).toBe(0);
    expect(matches.length).toBe(2);
  });

  it("preserves correct net qty when buys and sells alternate within one date", () => {
    const events: NormalizedEvent[] = [
      trade({ id: "z-sell-3",  date: "2024-03-01", qty: -3, amountEur: 30 }),
      trade({ id: "a-buy-10",  date: "2024-03-01", qty: 10, amountEur: 100 }),
      trade({ id: "m-sell-2",  date: "2024-03-01", qty: -2, amountEur: 20 }),
    ];
    const { lots } = replay(events);
    expect(lots.length).toBe(1);
    expect(Number(lots[0].remainingQty)).toBe(5);
  });

  it("respects ascending id order between two buys on the same day (stability)", () => {
    // Both positive qty → buys → sort by id ascending. Same lot count
    // either way, but the FIFO consumption order matters for matches.
    const events: NormalizedEvent[] = [
      trade({ id: "b-buy-5", date: "2024-04-01", qty: 5,  amountEur: 50 }),
      trade({ id: "a-buy-3", date: "2024-04-01", qty: 3,  amountEur: 30 }),
      trade({ id: "c-sell-3", date: "2024-04-02", qty: -3, amountEur: 33 }),
    ];
    const { lots, matches } = replay(events);
    // First buy by id (a-buy-3, qty 3) consumed entirely; b-buy-5 untouched.
    expect(matches.length).toBe(1);
    expect(matches[0].openingEventId).toBe("a-buy-3");
    expect(lots.length).toBe(1);
    expect(lots[0].sourceEventId).toBe("b-buy-5");
    expect(Number(lots[0].remainingQty)).toBe(5);
  });
});
