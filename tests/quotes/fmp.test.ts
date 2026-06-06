import { describe, it, expect } from "vitest";
import { parseFmpBatch } from "@/lib/quotes/fmp";

describe("parseFmpBatch", () => {
  it("returns a Quote per entry from a normal batched response", () => {
    // FMP /quote returns an array with one object per known symbol.
    // `timestamp` is unix seconds; we convert to YYYY-MM-DD.
    const json = [
      { symbol: "AAPL", price: 204.20, timestamp: Math.floor(Date.UTC(2026, 5, 5, 20, 0, 0) / 1000) },
      { symbol: "MSFT", price: 405.94, timestamp: Math.floor(Date.UTC(2026, 5, 5, 20, 0, 0) / 1000) },
    ];
    const out = parseFmpBatch(json, ["AAPL", "MSFT"]);
    expect(out).toEqual([
      { symbol: "AAPL", date: "2026-06-05", close: "204.20", currency: "USD" },
      { symbol: "MSFT", date: "2026-06-05", close: "405.94", currency: "USD" },
    ]);
  });

  it("silently drops symbols FMP doesn't return", () => {
    // FMP simply omits unknown tickers from the response — no per-symbol
    // error object. Caller can detect what's missing by diffing against
    // the requested list.
    const json = [
      { symbol: "AAPL", price: 204.20, timestamp: Math.floor(Date.UTC(2026, 5, 5) / 1000) },
    ];
    const out = parseFmpBatch(json, ["AAPL", "ZZZZ"]);
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe("AAPL");
  });

  it("returns [] when FMP returns an error envelope (bad key, rate limit)", () => {
    expect(parseFmpBatch({ "Error Message": "Invalid API key" }, ["AAPL"])).toEqual([]);
    expect(parseFmpBatch({ message: "Limit reached" }, ["AAPL"])).toEqual([]);
  });

  it("returns [] on empty array (no symbols matched)", () => {
    expect(parseFmpBatch([], ["AAPL", "MSFT"])).toEqual([]);
  });

  it("skips entries with missing price or timestamp", () => {
    const json = [
      { symbol: "AAPL", price: null, timestamp: 1700_000_000 },
      { symbol: "MSFT", price: 405.94, timestamp: null },
      { symbol: "GOOGL", price: 200, timestamp: Math.floor(Date.UTC(2026, 5, 5) / 1000) },
    ];
    const out = parseFmpBatch(json, ["AAPL", "MSFT", "GOOGL"]);
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe("GOOGL");
  });

  it("rounds price to 2 decimal places (FMP returns full precision)", () => {
    const json = [{ symbol: "AAPL", price: 204.19999999, timestamp: Math.floor(Date.UTC(2026, 5, 5) / 1000) }];
    expect(parseFmpBatch(json, ["AAPL"])[0].close).toBe("204.20");
  });

  it("only matches FMP entries whose symbol was in the requested list", () => {
    // Defensive: if FMP ever returns an unrelated symbol (e.g. trailing
    // recommendation), don't smuggle it into the cache.
    const json = [
      { symbol: "AAPL", price: 200, timestamp: Math.floor(Date.UTC(2026, 5, 5) / 1000) },
      { symbol: "SOMETHING_ELSE", price: 1, timestamp: Math.floor(Date.UTC(2026, 5, 5) / 1000) },
    ];
    const out = parseFmpBatch(json, ["AAPL"]);
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe("AAPL");
  });
});
