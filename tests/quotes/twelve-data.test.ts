import { describe, it, expect } from "vitest";
import { parseTwelveDataQuote, parseTwelveDataBatch } from "@/lib/quotes/twelve-data";

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
});

describe("parseTwelveDataBatch", () => {
  it("returns a quote per requested symbol from a batched response", () => {
    const json = {
      AAPL: { symbol: "AAPL", datetime: "2026-06-05", close: "204.20", currency: "USD" },
      MSFT: { symbol: "MSFT", datetime: "2026-06-05", close: "405.94", currency: "USD" },
    };
    const out = parseTwelveDataBatch(json, ["AAPL", "MSFT"]);
    expect(out).toEqual([
      { symbol: "AAPL", date: "2026-06-05", close: "204.20", currency: "USD" },
      { symbol: "MSFT", date: "2026-06-05", close: "405.94", currency: "USD" },
    ]);
  });

  it("skips symbols whose entry is an error code (e.g. unknown symbol)", () => {
    const json = {
      AAPL: { symbol: "AAPL", datetime: "2026-06-05", close: "204.20", currency: "USD" },
      ZZZZ: { code: 400, message: "Symbol not found" },
    };
    const out = parseTwelveDataBatch(json, ["AAPL", "ZZZZ"]);
    expect(out).toHaveLength(1);
    expect(out[0].symbol).toBe("AAPL");
  });

  it("returns an empty list when every symbol failed (whole-batch error)", () => {
    // Twelve Data shape on a batched failure: top-level error object.
    expect(parseTwelveDataBatch({ code: 429, message: "Hit limit" }, ["AAPL", "MSFT"])).toEqual([]);
  });

  it("handles a single-symbol batch that returns the unwrapped shape", () => {
    // When the request had a single symbol the response is the bare quote
    // object, not a {SYMBOL: {...}} map. Cover that.
    const json = { symbol: "AAPL", datetime: "2026-06-05", close: "204.20", currency: "USD" };
    const out = parseTwelveDataBatch(json, ["AAPL"]);
    expect(out).toEqual([{ symbol: "AAPL", date: "2026-06-05", close: "204.20", currency: "USD" }]);
  });

  it("maps the input symbol back, not Twelve Data's normalised one", () => {
    // We send 'TRN.L', Twelve Data may echo back 'TRN'. We need the result
    // to match our internal ticker so the cache write keys correctly.
    const json = { "TRN.L": { symbol: "TRN", datetime: "2026-06-05", close: "254.00", currency: "GBp" } };
    const out = parseTwelveDataBatch(json, ["TRN.L"]);
    expect(out[0].symbol).toBe("TRN.L");
    // GBp (LSE pence) gets normalised to GBP units, like the Yahoo parser.
    expect(out[0]).toEqual({ symbol: "TRN.L", date: "2026-06-05", close: "2.54", currency: "GBP" });
  });
});
