import { describe, it, expect } from "vitest";
import { parseManualLink, EXCHANGE_SUFFIX } from "@/lib/marketdata/manual-link";

describe("parseManualLink — justETF", () => {
  it("extracts isin from ?isin= query", () => {
    expect(
      parseManualLink("https://www.justetf.com/en/etf-profile.html?isin=IE00B0M63177"),
    ).toEqual({ provider: "justetf", isin: "IE00B0M63177" });
  });

  it("extracts isin from a /stock-profiles/{ISIN} path (EU stock)", () => {
    expect(
      parseManualLink("https://www.justetf.com/en/stock-profiles/IE00BYTBXV33"),
    ).toEqual({ provider: "justetf", isin: "IE00BYTBXV33" });
  });

  it("errors when no isin is present in query or path", () => {
    const out = parseManualLink("https://www.justetf.com/en/etf-profile.html");
    expect(out).toHaveProperty("error");
  });
});

describe("parseManualLink — Yahoo Finance", () => {
  it("plain symbol → yahooSymbol, no isin", () => {
    expect(parseManualLink("https://finance.yahoo.com/quote/TRN.L/")).toEqual({
      provider: "yahoo",
      yahooSymbol: "TRN.L",
    });
  });

  it("ISIN-shaped symbol with venue suffix → also sets isin", () => {
    expect(parseManualLink("https://finance.yahoo.com/quote/GB00BKDTK925.SG/")).toEqual({
      provider: "yahoo",
      yahooSymbol: "GB00BKDTK925.SG",
      isin: "GB00BKDTK925",
    });
  });

  it("takes the first path segment after /quote (e.g. /history)", () => {
    expect(parseManualLink("https://finance.yahoo.com/quote/TRN.L/history")).toEqual({
      provider: "yahoo",
      yahooSymbol: "TRN.L",
    });
  });
});

describe("parseManualLink — Google Finance", () => {
  // Google Finance is now fetched DIRECTLY (it's reachable from Vercel where
  // Yahoo is not), so the link keeps its raw ticker:exchange — no Yahoo suffix.
  it("beta quote TRN:LON → googlefinance ticker+exchange", () => {
    expect(parseManualLink("https://www.google.com/finance/beta/quote/TRN:LON")).toEqual({
      provider: "googlefinance",
      ticker: "TRN",
      exchange: "LON",
    });
  });

  it("US listing (NASDAQ) → googlefinance ticker+exchange", () => {
    expect(parseManualLink("https://www.google.com/finance/quote/AAPL:NASDAQ")).toEqual({
      provider: "googlefinance",
      ticker: "AAPL",
      exchange: "NASDAQ",
    });
  });

  it("missing ticker:exchange → error", () => {
    expect(parseManualLink("https://www.google.com/finance/quote/AAPL")).toEqual({
      error: "Google Finance link is missing the /finance/quote/{ticker}:{exchange} path.",
    });
  });
});

describe("parseManualLink — Stockopedia", () => {
  it("share-prices slug trainline-LON:TRN → yahooSymbol TRN.L", () => {
    expect(parseManualLink("https://www.stockopedia.com/share-prices/trainline-LON:TRN/")).toEqual({
      provider: "yahoo",
      ticker: "TRN",
      exchange: "LON",
      yahooSymbol: "TRN.L",
    });
  });
});

describe("parseManualLink — rejections", () => {
  it("unsupported host → error", () => {
    const out = parseManualLink("https://example.com/quote/TRN");
    expect(out).toHaveProperty("error");
    expect((out as { error: string }).error).toContain("Unsupported host");
  });

  it("malformed URL → error", () => {
    const out = parseManualLink("not a url");
    expect(out).toHaveProperty("error");
  });
});

describe("EXCHANGE_SUFFIX", () => {
  it("maps LON to .L and NYSE to empty string", () => {
    expect(EXCHANGE_SUFFIX.LON).toBe(".L");
    expect(EXCHANGE_SUFFIX.NYSE).toBe("");
  });
});
