import { describe, it, expect, vi, afterEach } from "vitest";
import { refreshQuotes } from "@/lib/quotes/refresh";
import type { InstrumentMeta } from "@/lib/marketdata/types";

/**
 * Phase A of the quote-sync fixes: a per-attempt diagnostic trace so we can
 * SEE why a held symbol is unpriced (which providers ran, the exact symbol
 * each tried, and whether it succeeded) instead of guessing.
 */
function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
function chart(price: number, currency: string): Response {
  const ts = Math.floor(Date.UTC(2026, 6, 3) / 1000);
  return json({ chart: { result: [{ meta: { regularMarketPrice: price, currency, regularMarketTime: ts } }] } });
}
function makeMeta(over: Partial<InstrumentMeta> & { isin: string }): InstrumentMeta {
  return {
    status: "OK", source: null, assetKind: null, manualUrl: null, failCount: 0, scrapedAt: null,
    updatedAt: new Date().toISOString(), name: null, sector: null, industry: null, yahooSymbol: null,
    yahooQuoteSymbol: null, justetfTicker: null, wkn: null, fundCurrency: null, domicile: null,
    indexName: null, investmentFocus: null, replication: null, terPct: null, distributionPolicy: null,
    distributionFrequency: null, teilfreistellungPct: null, fundSubtype: null, ...over,
  };
}

describe("refreshQuotes diagnostics (attempts trace)", () => {
  const orig = globalThis.fetch;
  afterEach(() => { globalThis.fetch = orig; delete process.env.FMP_API_KEY; vi.restoreAllMocks(); });

  it("records a failed FMP attempt then a successful Yahoo attempt for a US name FMP can't price", async () => {
    process.env.FMP_API_KEY = "k";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("financialmodelingprep.com")) return json([]); // FMP miss
      if (url.includes("finance.yahoo.com/v8/finance/chart/")) return chart(66.5, "USD");
      return new Response("nf", { status: 404 });
    }) as typeof globalThis.fetch;

    const r = await refreshQuotes(["BLBD"], {
      isinBySymbol: new Map([["BLBD", "US09571B1061"]]),
      metaByIsin: new Map(),
    });

    expect(r.attempts).toEqual(expect.arrayContaining([
      { symbol: "BLBD", provider: "fmp", symbolTried: "BLBD", ok: false },
      { symbol: "BLBD", provider: "yahoo", symbolTried: "BLBD", ok: true },
    ]));
    expect(r.quotes[0]?.source).toBe("YAHOO");
  });

  it("auto-prices a GB stock off its derived .L listing even with NO metadata", async () => {
    // The real-world TRN state: Yahoo search-by-ISIN was blocked so no meta
    // exists. The refresh must still price it off TRN.L (never bare "TRN",
    // which is Trinity Industries on Yahoo).
    const tried: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const m = url.match(/v8\/finance\/chart\/([^?]+)/);
      if (m) {
        tried.push(decodeURIComponent(m[1]));
        return chart(256, "GBp");
      }
      return new Response("nf", { status: 404 });
    }) as typeof globalThis.fetch;

    const r = await refreshQuotes(["TRN"], {
      isinBySymbol: new Map([["TRN", "GB00BKDTK925"]]),
      metaByIsin: new Map(), // no meta
    });

    expect(tried).toEqual(["TRN.L"]);
    expect(r.attempts).toEqual([{ symbol: "TRN", provider: "yahoo", symbolTried: "TRN.L", ok: true }]);
    expect(r.quotes[0]).toMatchObject({ symbol: "TRN", currency: "GBP", source: "YAHOO" });
  });

  it("records the pinned Yahoo listing (TRN.L) as the symbol tried for a manually-linked GB stock", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("finance.yahoo.com/v8/finance/chart/")) return chart(256, "GBp");
      return new Response("nf", { status: 404 });
    }) as typeof globalThis.fetch;

    const r = await refreshQuotes(["TRN"], {
      isinBySymbol: new Map([["TRN", "GB00BKDTK925"]]),
      metaByIsin: new Map([["GB00BKDTK925", makeMeta({ isin: "GB00BKDTK925", source: "YAHOO", yahooQuoteSymbol: "TRN.L" })]]),
    });

    expect(r.attempts).toEqual([
      { symbol: "TRN", provider: "yahoo", symbolTried: "TRN.L", ok: true },
    ]);
  });
});
