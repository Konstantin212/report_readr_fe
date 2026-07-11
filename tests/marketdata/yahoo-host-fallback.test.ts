/**
 * Yahoo's two JSON hosts (query1 / query2) fail independently — one can return
 * 401/5xx while the other serves fine. A quote must survive a single-host
 * outage by retrying on the alternate host before giving up (a plausible cause
 * of US names like BLBD/RBRK intermittently falling back to a snapshot).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchYahooQuoteByMeta } from "@/lib/marketdata/providers/yahoo";

function chartJson(price: number, currency: string): Response {
  const ts = Math.floor(Date.UTC(2026, 6, 3) / 1000);
  return new Response(
    JSON.stringify({ chart: { result: [{ meta: { regularMarketPrice: price, currency, regularMarketTime: ts } }] } }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("fetchYahooQuoteByMeta host fallback", () => {
  const orig = globalThis.fetch;
  afterEach(() => { globalThis.fetch = orig; vi.restoreAllMocks(); });

  it("falls back from query1 to query2 when the first host is unauthorized", async () => {
    const hosts: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      hosts.push(url);
      if (url.includes("query1.finance.yahoo.com")) return new Response("unauthorized", { status: 401 });
      if (url.includes("query2.finance.yahoo.com")) return chartJson(72, "USD");
      return new Response("nf", { status: 404 });
    }) as typeof globalThis.fetch;

    const q = await fetchYahooQuoteByMeta({ isin: "US09571B1061", symbol: "BLBD", currency: null }, null);

    expect(q).toMatchObject({ close: "72.00", currency: "USD", source: "YAHOO" });
    expect(hosts.some((u) => u.includes("query1.finance.yahoo.com/v8/finance/chart/BLBD"))).toBe(true);
    expect(hosts.some((u) => u.includes("query2.finance.yahoo.com/v8/finance/chart/BLBD"))).toBe(true);
  });
});
