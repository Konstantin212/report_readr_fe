import { describe, it, expect, vi, afterEach } from "vitest";
import { refreshQuotes } from "@/lib/quotes/refresh";
import type { InstrumentMeta } from "@/lib/marketdata/types";

/**
 * Router-driven refresh (AC-9.1/9.2). We drive the REAL `refreshQuotes`
 * with injected `isinBySymbol` / `metaByIsin` maps and mock `fetch`,
 * asserting the router sends each instrument to the right provider and
 * that the retired TwelveData / Stooq hosts are never touched.
 */

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** A full InstrumentMeta with everything null except the given overrides. */
function makeMeta(over: Partial<InstrumentMeta> & { isin: string }): InstrumentMeta {
  return {
    status: "OK",
    source: null,
    assetKind: null,
    manualUrl: null,
    failCount: 0,
    scrapedAt: null,
    updatedAt: new Date().toISOString(),
    name: null,
    sector: null,
    industry: null,
    yahooSymbol: null,
    yahooQuoteSymbol: null,
    justetfTicker: null,
    wkn: null,
    fundCurrency: null,
    domicile: null,
    indexName: null,
    investmentFocus: null,
    replication: null,
    terPct: null,
    distributionPolicy: null,
    distributionFrequency: null,
    teilfreistellungPct: null,
    fundSubtype: null,
    ...over,
  };
}

const IE_ETF = "IE00B5BMR087"; // non-US ETF
const GB_STOCK = "GB00BKDTK925"; // non-US equity

/**
 * Install a routing fetch mock. Records every requested URL in `calls` and
 * returns a plausible payload per host. TwelveData / Stooq hits throw so a
 * regression that reintroduces them fails loudly rather than silently.
 */
function installFetch(calls: string[]): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (/twelvedata|stooq/i.test(url)) {
      throw new Error(`retired provider must never be fetched: ${url}`);
    }
    if (url.includes("justetf.com/api/etfs/")) {
      return jsonResponse({ latestQuote: { raw: 59.0 }, latestQuoteDate: "2026-07-03" });
    }
    if (url.includes("finance.yahoo.com/v8/finance/chart/")) {
      const ts = Math.floor(Date.UTC(2026, 6, 3) / 1000);
      return jsonResponse({
        chart: {
          result: [
            {
              timestamp: [ts],
              meta: { regularMarketPrice: 123.45, currency: "GBP", regularMarketTime: ts },
              indicators: { quote: [{ close: [123.45] }] },
            },
          ],
        },
      });
    }
    if (url.includes("financialmodelingprep.com")) {
      const m = url.match(/[?&]symbol=([^&]+)/);
      const symbol = m ? decodeURIComponent(m[1]) : "?";
      return jsonResponse([
        { symbol, price: 100, timestamp: Math.floor(Date.UTC(2026, 5, 5) / 1000) },
      ]);
    }
    return new Response("not found", { status: 404 });
  }) as typeof globalThis.fetch;
}

describe("refreshQuotes routing", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
    delete process.env.FMP_API_KEY;
    vi.restoreAllMocks();
  });

  it("prices an ETF with JUSTETF meta off justETF (bySource.justEtf)", async () => {
    const calls: string[] = [];
    installFetch(calls);

    const result = await refreshQuotes(["SXR8"], {
      isinBySymbol: new Map([["SXR8", IE_ETF]]),
      metaByIsin: new Map([[IE_ETF, makeMeta({ isin: IE_ETF, source: "JUSTETF", assetKind: "etf" })]]),
    });

    expect(result.bySource.justEtf).toBe(1);
    expect(result.quotes).toEqual([
      { symbol: "SXR8", date: "2026-07-03", close: "59.00", currency: "EUR", source: "JUSTETF" },
    ]);
    expect(calls.some((u) => u.includes(`justetf.com/api/etfs/${IE_ETF}/quote`))).toBe(true);
    // planQuote returned only [justetf]; no fallback providers were tried.
    expect(calls.some((u) => u.includes("financialmodelingprep.com"))).toBe(false);
  });

  it("routes a non-US stock with YAHOO meta to yahoo", async () => {
    const calls: string[] = [];
    installFetch(calls);

    const result = await refreshQuotes(["TRN.L"], {
      isinBySymbol: new Map([["TRN.L", GB_STOCK]]),
      metaByIsin: new Map([
        [GB_STOCK, makeMeta({ isin: GB_STOCK, source: "YAHOO", assetKind: "stock", yahooQuoteSymbol: "TRN.L" })],
      ]),
    });

    expect(result.bySource.yahoo).toBe(1);
    expect(result.bySource.fmp).toBe(0);
    expect(calls.some((u) => u.includes("finance.yahoo.com/v8/finance/chart/TRN.L"))).toBe(true);
  });

  it("falls back to the raw FMP path for a symbol with no ISIN mapping", async () => {
    process.env.FMP_API_KEY = "test-key";
    const calls: string[] = [];
    installFetch(calls);

    const result = await refreshQuotes(["AAPL"]);

    expect(result.bySource.fmp).toBe(1);
    expect(result.quotes).toEqual([
      { symbol: "AAPL", date: "2026-06-05", close: "100.00", currency: "USD", source: "FMP" },
    ]);
    expect(calls.some((u) => u.includes("financialmodelingprep.com"))).toBe(true);
  });

  it("never fetches TwelveData or Stooq across a mixed batch", async () => {
    process.env.FMP_API_KEY = "test-key";
    const calls: string[] = [];
    installFetch(calls);

    await refreshQuotes(["SXR8", "TRN.L", "AAPL"], {
      isinBySymbol: new Map([
        ["SXR8", IE_ETF],
        ["TRN.L", GB_STOCK],
      ]),
      metaByIsin: new Map([
        [IE_ETF, makeMeta({ isin: IE_ETF, source: "JUSTETF", assetKind: "etf" })],
        [GB_STOCK, makeMeta({ isin: GB_STOCK, source: "YAHOO", assetKind: "stock", yahooQuoteSymbol: "TRN.L" })],
      ]),
    });

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.some((u) => /twelvedata|stooq/i.test(u))).toBe(false);
  });
});
