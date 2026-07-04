import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseInteractiveBrokersStatement, parseSymbolIsinFromDescription } from "@/lib/brokers/ibkr";

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

  it("extracts symbol + ISIN from dividend descriptions", () => {
    const dividends = result.events.filter(e => e.type === "DIVIDEND");
    // Every dividend row in the fixture leads with SYMBOL(ISIN).
    expect(dividends.length).toBeGreaterThan(0);
    expect(dividends.every(d => Boolean(d.symbol) && Boolean(d.isin))).toBe(true);

    const spyw = dividends.find(d => d.symbol === "SPYW");
    expect(spyw).toBeDefined();
    expect(spyw?.isin).toBe("IE00B5M1WJ87");

    const tsm = dividends.find(d => d.symbol === "TSM");
    expect(tsm?.isin).toBe("US8740391003");
  });

  it("parses the Withholding Tax section into WITHHOLDING_TAX events", () => {
    const wht = result.events.filter(e => e.type === "WITHHOLDING_TAX");
    // Fixture has two dated TW-Tax rows (the Total line is dropped).
    expect(wht.length).toBe(2);

    for (const e of wht) {
      expect(e.symbol).toBe("TSM");
      expect(e.isin).toBe("US8740391003");
      expect(e.currency).toBe("USD");
      // Raw amount is negative; withholdingTax is its absolute value.
      expect(Number(e.amount)).toBeLessThan(0);
      expect(Number(e.withholdingTax)).toBe(Math.abs(Number(e.amount)));
      // Non-EUR tax rows must be flagged for FX review.
      expect(e.requiresReview).toBe(true);
      expect(e.fxSource).toBe("MISSING");
    }

    const amounts = wht.map(e => Number(e.withholdingTax)).sort((a, b) => a - b);
    expect(amounts).toEqual([0.49, 0.51]);
  });

  it("flags non-EUR events for review", () => {
    const usd = result.events.filter(e => e.currency === "USD" && e.type === "TRADE");
    expect(usd.length).toBeGreaterThan(0);
    // USD trades with realizedPnl should be marked for review
    const withReview = usd.filter(e => e.requiresReview === true || e.fxSource === "MISSING");
    expect(withReview.length).toBeGreaterThan(0);
  });

  it("stamps instrumentKind from IBKR Asset Category on trades", () => {
    // The Citigroup bond ("C Float 06/09/27", US172967MZ11) trades under
    // symbol "C" — same ticker as Citigroup common stock — so the persisted
    // bond kind is what keeps its realized loss on the right ELSTER line.
    const bond = result.events.find(e => e.type === "TRADE" && e.isin === "US172967MZ11");
    expect(bond?.instrumentKind).toBe("bond");

    const stock = result.events.find(e => e.type === "TRADE" && e.symbol === "TSM");
    expect(stock?.instrumentKind).toBe("stock");
  });
});

describe("parseSymbolIsinFromDescription", () => {
  it("extracts symbol + ISIN from a dividend description", () => {
    expect(
      parseSymbolIsinFromDescription("SPYW(IE00B5M1WJ87) Cash Dividend EUR 0.2363 per Share (Mixed Income)"),
    ).toEqual({ symbol: "SPYW", isin: "IE00B5M1WJ87" });
  });

  it("extracts symbol + ISIN from a withholding-tax description", () => {
    expect(
      parseSymbolIsinFromDescription("TSM(US8740391003) Cash Dividend USD 0.780305 per Share - TW Tax"),
    ).toEqual({ symbol: "TSM", isin: "US8740391003" });
  });

  it("returns {} for a description without a leading SYMBOL(ISIN)", () => {
    expect(parseSymbolIsinFromDescription("Electronic Fund Transfer")).toEqual({});
  });

  it("returns {} for undefined", () => {
    expect(parseSymbolIsinFromDescription(undefined)).toEqual({});
  });
});
