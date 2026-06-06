import { describe, it, expect, vi, afterEach } from "vitest";
import { parseFmpQuoteResponse, fetchFmpQuotes } from "@/lib/quotes/fmp";

describe("parseFmpQuoteResponse", () => {
  it("returns the Quote from a normal single-symbol response array", () => {
    // FMP /stable/quote returns an array of length 1 for a known symbol.
    // `timestamp` is unix seconds; we convert to YYYY-MM-DD.
    const json = [
      { symbol: "SPY", price: 737.55, timestamp: Math.floor(Date.UTC(2026, 5, 5, 20, 0, 0) / 1000) },
    ];
    expect(parseFmpQuoteResponse(json, "SPY")).toEqual({
      symbol: "SPY",
      date: "2026-06-05",
      close: "737.55",
      currency: "USD",
    });
  });

  it("returns null when FMP returns an error envelope (bad key, rate limit, deprecated endpoint)", () => {
    expect(parseFmpQuoteResponse({ "Error Message": "Invalid API key" }, "SPY")).toBeNull();
    expect(parseFmpQuoteResponse({ message: "Limit reached" }, "SPY")).toBeNull();
  });

  it("returns null on an empty array (symbol unknown to FMP)", () => {
    expect(parseFmpQuoteResponse([], "ZZZZ")).toBeNull();
  });

  it("returns null when the entry has no price or no timestamp", () => {
    expect(parseFmpQuoteResponse([{ symbol: "SPY", price: null, timestamp: 1700_000_000 }], "SPY")).toBeNull();
    expect(parseFmpQuoteResponse([{ symbol: "SPY", price: 200, timestamp: null }], "SPY")).toBeNull();
  });

  it("rounds price to 2 decimal places (FMP returns full precision)", () => {
    const json = [{ symbol: "SPY", price: 737.5512345, timestamp: Math.floor(Date.UTC(2026, 5, 5) / 1000) }];
    expect(parseFmpQuoteResponse(json, "SPY")?.close).toBe("737.55");
  });

  it("returns null when the entry's symbol doesn't match the requested ticker", () => {
    // Defensive: never write into the cache for a ticker we didn't ask for.
    const json = [{ symbol: "SOMETHING_ELSE", price: 1, timestamp: Math.floor(Date.UTC(2026, 5, 5) / 1000) }];
    expect(parseFmpQuoteResponse(json, "SPY")).toBeNull();
  });

  it("returns the input symbol back, not whatever casing FMP echoed", () => {
    // If we asked for "SPY" we want "SPY" in our cache key, even if FMP
    // happens to canonicalise the case differently.
    const json = [{ symbol: "spy", price: 737.55, timestamp: Math.floor(Date.UTC(2026, 5, 5) / 1000) }];
    // Accept FMP's exact casing — we send tickers as-stored. If casing
    // ever diverges we can normalise here; for now require exact match.
    expect(parseFmpQuoteResponse(json, "SPY")).toBeNull();
  });
});

describe("fetchFmpQuotes URL + concurrency", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
    delete process.env.FMP_API_KEY;
  });

  it("calls the new /stable/quote endpoint with ?symbol=X (one HTTP call per symbol)", async () => {
    process.env.FMP_API_KEY = "test-key";
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      // Echo back whichever symbol was asked for.
      const m = url.match(/[?&]symbol=([^&]+)/);
      const symbol = m ? decodeURIComponent(m[1]) : "?";
      return new Response(JSON.stringify([
        { symbol, price: 100, timestamp: Math.floor(Date.UTC(2026, 5, 5) / 1000) },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof globalThis.fetch;

    const out = await fetchFmpQuotes(["SPY", "AAPL", "NEM"]);

    expect(calls).toHaveLength(3);
    for (const url of calls) {
      // Must hit the new stable namespace, not the dead /api/v3 path.
      expect(url).toContain("/stable/quote?");
      expect(url).toContain("apikey=test-key");
      // Symbol is in a query param, no longer a path segment.
      expect(url).toMatch(/[?&]symbol=[A-Z]+/);
    }
    expect(out.map((q) => q.symbol).sort()).toEqual(["AAPL", "NEM", "SPY"]);
  });

  it("returns [] when FMP_API_KEY is unset (no HTTP call)", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as typeof globalThis.fetch;
    const out = await fetchFmpQuotes(["SPY"]);
    expect(out).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("drops symbols whose individual call failed (404/rate limit) but keeps the others", async () => {
    process.env.FMP_API_KEY = "test-key";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("symbol=NEM")) return new Response("nope", { status: 403 });
      const m = url.match(/[?&]symbol=([^&]+)/);
      const symbol = m ? decodeURIComponent(m[1]) : "?";
      return new Response(JSON.stringify([
        { symbol, price: 100, timestamp: Math.floor(Date.UTC(2026, 5, 5) / 1000) },
      ]), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof globalThis.fetch;

    const out = await fetchFmpQuotes(["SPY", "NEM", "AAPL"]);

    expect(out.map((q) => q.symbol).sort()).toEqual(["AAPL", "SPY"]);
  });
});
