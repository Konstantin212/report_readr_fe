import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseInteractiveBrokersStatement } from "@/lib/brokers/ibkr";

describe("IBKR parser — 2025 real sample", () => {
  const bytes = readFileSync("tests/fixtures/brokers/ibkr-2025.csv");
  const result = parseInteractiveBrokersStatement("ibkr-2025.csv", bytes, 2025);

  it("identifies the account", () => {
    expect(result.account.broker).toBe("INTERACTIVE_BROKERS");
    expect(result.account.accountNumber).toBe("U00000000");
    expect(result.account.baseCurrency).toBe("EUR");
  });

  it("parses trades", () => {
    const trades = result.events.filter(e => e.type === "TRADE");
    expect(trades.length).toBeGreaterThan(0);
    expect(trades.every(t => /^\d{4}-\d{2}-\d{2}$/.test(t.date))).toBe(true);
  });

  it("parses dividends and interest", () => {
    expect(result.events.some(e => e.type === "DIVIDEND")).toBe(true);
    expect(result.events.some(e => e.type === "INTEREST")).toBe(true);
  });

  it("flags non-EUR events for review", () => {
    const usd = result.events.filter(e => e.currency === "USD" && e.type === "TRADE");
    expect(usd.length).toBeGreaterThan(0);
    // USD trades with realizedPnl should be marked for review
    const withReview = usd.filter(e => e.requiresReview === true || e.fxSource === "MISSING");
    expect(withReview.length).toBeGreaterThan(0);
  });
});
