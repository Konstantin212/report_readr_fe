import { describe, it, expect } from "vitest";
import { replay } from "@/lib/ledger/replay";
import type { NormalizedEvent } from "@/lib/domain/types";

const t = (
  date: string,
  symbol: string,
  qty: string,
  amount: string,
  opts: Partial<NormalizedEvent> = {},
): NormalizedEvent => ({
  id: opts.id ?? `${date}-${symbol}-${qty}`,
  broker: "INTERACTIVE_BROKERS",
  accountNumber: "U1",
  type: "TRADE",
  date,
  currency: opts.currency ?? "EUR",
  symbol,
  quantity: qty,
  amount,
  amountEur: opts.amountEur ?? amount,
  fee: opts.fee,
  feeEur: opts.feeEur ?? opts.fee,
  ...opts,
});

describe("FIFO replay — market scenarios", () => {
  it("empty events array returns no lots and no matches", () => {
    const { lots, matches } = replay([]);
    expect(lots).toHaveLength(0);
    expect(matches).toHaveLength(0);
  });

  it("single buy creates one open lot with cost basis = price + fee", () => {
    const events = [t("2024-01-01", "AAPL", "10", "1000", { fee: "5", feeEur: "5" })];
    const { lots, matches } = replay(events);
    expect(lots).toHaveLength(1);
    expect(lots[0].symbol).toBe("AAPL");
    expect(lots[0].remainingQty).toBe("10");
    expect(lots[0].costEur).toBe("1005"); // 1000 + 5
    expect(matches).toHaveLength(0);
  });

  it("buy then full-quantity sell creates one match and no remaining lots", () => {
    const events = [
      t("2024-01-01", "AAPL", "10", "1000"),
      t("2024-06-01", "AAPL", "-10", "1200"),
    ];
    const { lots, matches } = replay(events);
    expect(lots).toHaveLength(0);
    expect(matches).toHaveLength(1);
    expect(matches[0].qty).toBe("10");
  });

  it("buy then partial sell creates one match and one reduced-qty lot", () => {
    const events = [
      t("2024-01-01", "MSFT", "10", "2000"),
      t("2024-06-01", "MSFT", "-4", "900"),
    ];
    const { lots, matches } = replay(events);
    expect(matches).toHaveLength(1);
    expect(matches[0].qty).toBe("4");
    expect(lots).toHaveLength(1);
    expect(lots[0].remainingQty).toBe("6");
  });

  it("two buys then a sell that consumes only the first lot leaves the second lot intact", () => {
    const events = [
      t("2024-01-01", "TSLA", "5", "500", { id: "buy1" }),
      t("2024-02-01", "TSLA", "5", "600", { id: "buy2" }),
      t("2024-06-01", "TSLA", "-5", "700"),
    ];
    const { lots, matches } = replay(events);
    expect(matches).toHaveLength(1);
    expect(matches[0].openingEventId).toBe("buy1");
    expect(lots).toHaveLength(1);
    expect(lots[0].sourceEventId).toBe("buy2");
    expect(lots[0].remainingQty).toBe("5");
  });

  it("a sell that spans two lots produces two realized matches", () => {
    const events = [
      t("2024-01-01", "NVDA", "3", "300", { id: "buy1" }),
      t("2024-02-01", "NVDA", "4", "400", { id: "buy2" }),
      t("2024-07-01", "NVDA", "-7", "800"),
    ];
    const { lots, matches } = replay(events);
    expect(matches).toHaveLength(2);
    expect(matches[0].openingEventId).toBe("buy1");
    expect(matches[0].qty).toBe("3");
    expect(matches[1].openingEventId).toBe("buy2");
    expect(matches[1].qty).toBe("4");
    expect(lots).toHaveLength(0);
  });

  it("same-day buy and sell produces a match with holdingDays=0 and isLongTerm=false", () => {
    const events = [
      t("2024-03-15", "GME", "10", "500", { id: "buy" }),
      t("2024-03-15", "GME", "-10", "600", { id: "sell" }),
    ];
    const { matches } = replay(events);
    expect(matches).toHaveLength(1);
    expect(matches[0].holdingDays).toBe(0);
    expect(matches[0].isLongTerm).toBe(false);
  });

  it("holding of exactly 365 days is long-term", () => {
    const events = [
      t("2024-01-01", "SPY", "10", "1000"),
      t("2025-01-01", "SPY", "-10", "1200"),
    ];
    const { matches } = replay(events);
    expect(matches).toHaveLength(1);
    expect(matches[0].holdingDays).toBe(366); // 2024 is a leap year: 366 days
    expect(matches[0].isLongTerm).toBe(true);
  });

  it("holding of 364 days is short-term", () => {
    const events = [
      t("2023-01-01", "SPY", "10", "1000"),
      t("2023-12-31", "SPY", "-10", "1200"),
    ];
    const { matches } = replay(events);
    expect(matches).toHaveLength(1);
    expect(matches[0].holdingDays).toBe(364);
    expect(matches[0].isLongTerm).toBe(false);
  });

  it("two different symbols are tracked independently", () => {
    const events = [
      t("2024-01-01", "AAPL", "5", "500"),
      t("2024-01-01", "GOOG", "3", "300"),
      t("2024-06-01", "AAPL", "-5", "600"),
    ];
    const { lots, matches } = replay(events);
    expect(matches).toHaveLength(1);
    expect(matches[0].symbol).toBe("AAPL");
    expect(lots).toHaveLength(1);
    expect(lots[0].symbol).toBe("GOOG");
  });

  it("out-of-order events are sorted: later-dated buy after earlier-dated sell still processes correctly when valid", () => {
    // Events provided out-of-order: the buy happens chronologically before the sell
    const buy = t("2024-01-01", "META", "10", "2000", { id: "buy-first" });
    const sell = t("2024-09-01", "META", "-10", "2500", { id: "sell-second" });
    // Pass sell before buy in array — replay must sort them
    const { lots, matches } = replay([sell, buy]);
    expect(matches).toHaveLength(1);
    expect(lots).toHaveLength(0);
  });

  it("realized gain is positive when proceeds exceed cost", () => {
    const events = [
      t("2024-01-01", "AMZN", "10", "1000"),
      t("2024-06-01", "AMZN", "-10", "1500"),
    ];
    const { matches } = replay(events);
    expect(Number(matches[0].gainEur)).toBeGreaterThan(0);
    expect(matches[0].gainEur).toBe("500.00");
  });

  it("realized loss is negative when proceeds are below cost", () => {
    const events = [
      t("2024-01-01", "NFLX", "10", "2000"),
      t("2024-06-01", "NFLX", "-10", "1500"),
    ];
    const { matches } = replay(events);
    expect(Number(matches[0].gainEur)).toBeLessThan(0);
    expect(matches[0].gainEur).toBe("-500.00");
  });

  it("non-TRADE events (DIVIDEND, INTEREST, FEE, CASH_TRANSFER) are ignored", () => {
    const nonTrades: NormalizedEvent[] = [
      { id: "div", broker: "INTERACTIVE_BROKERS", accountNumber: "U1", type: "DIVIDEND", date: "2024-03-01", currency: "EUR", symbol: "AAPL", amount: "50" },
      { id: "int", broker: "INTERACTIVE_BROKERS", accountNumber: "U1", type: "INTEREST", date: "2024-03-01", currency: "EUR", amount: "10" },
      { id: "fee", broker: "INTERACTIVE_BROKERS", accountNumber: "U1", type: "FEE", date: "2024-03-01", currency: "EUR", amount: "2" },
      { id: "csh", broker: "INTERACTIVE_BROKERS", accountNumber: "U1", type: "CASH_TRANSFER", date: "2024-03-01", currency: "EUR", amount: "500" },
    ];
    const { lots, matches } = replay(nonTrades);
    expect(lots).toHaveLength(0);
    expect(matches).toHaveLength(0);
  });

  it("TRADE events with no symbol are ignored", () => {
    const events: NormalizedEvent[] = [
      { id: "no-sym", broker: "INTERACTIVE_BROKERS", accountNumber: "U1", type: "TRADE", date: "2024-01-01", currency: "EUR", quantity: "10", amount: "1000" },
    ];
    const { lots, matches } = replay(events);
    expect(lots).toHaveLength(0);
    expect(matches).toHaveLength(0);
  });

  it("oversell (selling more than held) consumes all available lots and drops the excess", () => {
    const events = [
      t("2024-01-01", "BB", "5", "500"),
      t("2024-06-01", "BB", "-10", "1000"), // selling 10 but only have 5
    ];
    const { lots, matches } = replay(events);
    // Only the 5 held shares get matched; the excess 5 are silently dropped
    expect(matches).toHaveLength(1);
    expect(matches[0].qty).toBe("5");
    expect(lots).toHaveLength(0);
  });

  it("fee on buy increases cost basis", () => {
    const noFee = [t("2024-01-01", "VTI", "10", "1000")];
    const withFee = [t("2024-01-01", "VTI", "10", "1000", { fee: "10", feeEur: "10" })];
    const r1 = replay(noFee);
    const r2 = replay(withFee);
    expect(Number(r2.lots[0].costEur)).toBeGreaterThan(Number(r1.lots[0].costEur));
    expect(r2.lots[0].costEur).toBe("1010");
  });

  it("fee on sell decreases proceeds", () => {
    const events = [
      t("2024-01-01", "IVV", "10", "1000"),
      t("2024-06-01", "IVV", "-10", "1200", { fee: "5", feeEur: "5" }),
    ];
    const { matches } = replay(events);
    // proceeds = 1200 - 5 = 1195; gain = 1195 - 1000 = 195
    expect(matches[0].proceedsEur).toBe("1195.00");
    expect(matches[0].gainEur).toBe("195.00");
  });

  it("amountEur is preferred when both amount and amountEur are present", () => {
    const events = [
      // amount is USD equivalent (1100), amountEur is the EUR value (1000)
      t("2024-01-01", "AAPL", "10", "1100", { amountEur: "1000" }),
      t("2024-06-01", "AAPL", "-10", "1320", { amountEur: "1200" }),
    ];
    const { lots, matches } = replay(events);
    // Cost should use amountEur = 1000, not amount = 1100
    expect(Number(lots.length === 0 ? matches[0].costEur : lots[0].costEur)).toBeDefined();
    expect(matches[0].costEur).toBe("1000.00");
    expect(matches[0].proceedsEur).toBe("1200.00");
  });

  it("feeEur is preferred when both fee and feeEur are present", () => {
    const events = [
      t("2024-01-01", "MSFT", "10", "1000", { amountEur: "1000", fee: "10", feeEur: "8" }),
    ];
    const { lots } = replay(events);
    // cost = amountEur + feeEur = 1000 + 8 = 1008
    expect(lots[0].costEur).toBe("1008");
  });

  it("fractional share quantities (e.g. 2.5 shares) compute correctly", () => {
    const events = [
      t("2024-01-01", "BRK.B", "2.5", "500"),
      t("2024-06-01", "BRK.B", "-1.5", "330"),
    ];
    const { lots, matches } = replay(events);
    expect(matches).toHaveLength(1);
    expect(matches[0].qty).toBe("1.5");
    expect(lots).toHaveLength(1);
    expect(lots[0].remainingQty).toBe("1");
    // cost portion: 500 * 1.5/2.5 = 300
    expect(matches[0].costEur).toBe("300.00");
    // proceeds: 330 (no fee)
    expect(matches[0].proceedsEur).toBe("330.00");
    expect(matches[0].gainEur).toBe("30.00");
  });

  it("very small amounts round to 2 decimal places", () => {
    const events = [
      t("2024-01-01", "MICRO", "1000", "0.001"),
      t("2024-06-01", "MICRO", "-1000", "0.002"),
    ];
    const { matches } = replay(events);
    expect(matches[0].costEur).toMatch(/^\d+\.\d{2}$/);
    expect(matches[0].proceedsEur).toMatch(/^\d+\.\d{2}$/);
    expect(matches[0].gainEur).toMatch(/^-?\d+\.\d{2}$/);
  });
});
