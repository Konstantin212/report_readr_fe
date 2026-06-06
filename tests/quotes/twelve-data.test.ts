import { describe, it, expect, vi, afterEach } from "vitest";
import { parseTwelveDataQuote, fetchTwelveDataQuotes } from "@/lib/quotes/twelve-data";

describe("parseTwelveDataQuote", () => {
  it("parses a single-symbol /quote response", () => {
    const json = {
      symbol: "AAPL",
      name: "Apple Inc",
      exchange: "NASDAQ",
      currency: "USD",
      datetime: "2026-06-05",
      open: "200.10",
      high: "205.00",
      low: "199.50",
      close: "204.20",
    };
    expect(parseTwelveDataQuote(json, "AAPL")).toEqual({
      symbol: "AAPL",
      date: "2026-06-05",
      close: "204.20",
      currency: "USD",
    });
  });

  it("returns null on an error response (rate limit, bad key, etc.)", () => {
    expect(parseTwelveDataQuote({ code: 429, message: "Hit limit" }, "AAPL")).toBeNull();
    expect(parseTwelveDataQuote({ status: "error", message: "Invalid API key" }, "AAPL")).toBeNull();
  });

  it("returns null when close is missing or 'N/D'", () => {
    expect(parseTwelveDataQuote({ symbol: "AAPL", datetime: "2026-06-05", close: null, currency: "USD" }, "AAPL")).toBeNull();
    expect(parseTwelveDataQuote({ symbol: "AAPL", datetime: "2026-06-05", close: "N/D", currency: "USD" }, "AAPL")).toBeNull();
  });

  it("trims a datetime with time-of-day to YYYY-MM-DD", () => {
    // Twelve Data sometimes returns "2026-06-05 16:00:00" for intraday quotes.
    const out = parseTwelveDataQuote(
      { symbol: "AAPL", datetime: "2026-06-05 16:00:00", close: "204.20", currency: "USD" },
      "AAPL",
    );
    expect(out?.date).toBe("2026-06-05");
  });

  it("normalises LSE pence (GBp) into GBP units", () => {
    const out = parseTwelveDataQuote(
      { symbol: "TRN", datetime: "2026-06-05", close: "254.00", currency: "GBp" },
      "TRN",
    );
    expect(out).toEqual({ symbol: "TRN", date: "2026-06-05", close: "2.54", currency: "GBP" });
  });
});

describe("fetchTwelveDataQuotes URL + per-symbol parallel calls", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
    delete process.env.TWELVE_DATA_API_KEY;
  });

  it("calls /quote once per symbol with optional &exchange=", async () => {
    process.env.TWELVE_DATA_API_KEY = "test-key";
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      const m = url.match(/[?&]symbol=([^&]+)/);
      const symbol = m ? decodeURIComponent(m[1]) : "?";
      return new Response(JSON.stringify({
        symbol, datetime: "2026-06-05", close: "100", currency: "USD",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof globalThis.fetch;

    await fetchTwelveDataQuotes(["AAPL", "TRN", "SPYW"]);

    expect(calls).toHaveLength(3);
    // AAPL: bare symbol, no exchange
    expect(calls.some((u) => /symbol=AAPL(&|$)/.test(u) && !u.includes("exchange="))).toBe(true);
    // TRN: must include exchange=LSE to avoid Trinity Industries collision
    expect(calls.some((u) => u.includes("symbol=TRN") && u.includes("exchange=LSE"))).toBe(true);
    // SPYW: Xetra
    expect(calls.some((u) => u.includes("symbol=SPYW") && u.includes("exchange=XETR"))).toBe(true);
    // All have the API key
    for (const url of calls) expect(url).toContain("apikey=test-key");
  });

  it("re-keys the response to the internal ticker (TD echoes the bare external symbol)", async () => {
    process.env.TWELVE_DATA_API_KEY = "test-key";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const m = url.match(/[?&]symbol=([^&]+)/);
      const symbol = m ? decodeURIComponent(m[1]) : "?";
      // TD echoes back the external symbol it received (e.g. "TRN", not "TRN.L")
      return new Response(JSON.stringify({
        symbol, datetime: "2026-06-05", close: "254.00", currency: "GBp",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof globalThis.fetch;

    const out = await fetchTwelveDataQuotes(["TRN"]);
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe("TRN"); // internal ticker, not whatever TD echoed
    expect(out[0]).toEqual({ symbol: "TRN", date: "2026-06-05", close: "2.54", currency: "GBP" });
  });

  it("returns [] when TWELVE_DATA_API_KEY is unset (no HTTP call)", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as typeof globalThis.fetch;
    const out = await fetchTwelveDataQuotes(["AAPL"]);
    expect(out).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("drops failures but keeps successful sibling symbols", async () => {
    process.env.TWELVE_DATA_API_KEY = "test-key";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("symbol=ZZZZ")) return new Response("nope", { status: 429 });
      const m = url.match(/[?&]symbol=([^&]+)/);
      const symbol = m ? decodeURIComponent(m[1]) : "?";
      return new Response(JSON.stringify({
        symbol, datetime: "2026-06-05", close: "100", currency: "USD",
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof globalThis.fetch;

    const out = await fetchTwelveDataQuotes(["AAPL", "ZZZZ", "MSFT"]);
    expect(out.map((q) => q.symbol).sort()).toEqual(["AAPL", "MSFT"]);
  });
});
