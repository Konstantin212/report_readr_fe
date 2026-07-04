import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseSearchResponse,
  parseChartMeta,
  yahooProvider,
} from "@/lib/marketdata/providers/yahoo";
import type { InstrumentRef } from "@/lib/marketdata/types";

const FIXTURE_DIR = join(process.cwd(), "tests", "fixtures", "marketdata");
const readFixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8"));

const searchFixture = readFixture("yahoo.search.GB00BKDTK925.json");
const chartTrnFixture = readFixture("yahoo.chart.TRN-L.json"); // GBp case
const chartSgFixture = readFixture("yahoo.chart.GB00BKDTK925-SG.json"); // EUR case

describe("parseSearchResponse", () => {
  it("resolves an ISIN to the primary equity listing with sector/industry", () => {
    const res = parseSearchResponse(searchFixture, "GB00BKDTK925");
    expect(res.status).toBe("OK");
    if (res.status !== "OK") return;
    expect(res.source).toBe("YAHOO");
    expect(res.assetKind).toBe("stock");
    expect(res.fields.name).toBe("Trainline plc");
    expect(res.fields.yahooSymbol).toBe("TRN.L");
    expect(res.fields.sector).toBe("Consumer Cyclical");
    expect(res.fields.industry).toBe("Travel Services");
    // Prefers the {isin}.SG Stuttgart EUR line for pricing.
    expect(res.fields.yahooQuoteSymbol).toBe("GB00BKDTK925.SG");
    expect(res.raw).toBe(searchFixture);
  });

  it("maps quoteType ETF/MUTUALFUND/unknown to etf/other/other", () => {
    const mk = (quoteType: string) => ({
      quotes: [{ symbol: "X", score: 1, quoteType, sectorDisp: "S" }],
    });
    const etf = parseSearchResponse(mk("ETF"), "X");
    const mutual = parseSearchResponse(mk("MUTUALFUND"), "X");
    const unknown = parseSearchResponse(mk("SOMETHING"), "X");
    expect(etf.status === "OK" && etf.assetKind).toBe("etf");
    expect(mutual.status === "OK" && mutual.assetKind).toBe("other");
    expect(unknown.status === "OK" && unknown.assetKind).toBe("other");
  });

  it("picks the highest-score entry that has a sectorDisp as PRIMARY", () => {
    const json = {
      quotes: [
        { symbol: "LOW.L", score: 10, quoteType: "EQUITY", sectorDisp: "Tech", longname: "Low" },
        { symbol: "HIGH.SG", score: 99, quoteType: "EQUITY" }, // higher score, no sector
        { symbol: "MID.L", score: 50, quoteType: "EQUITY", sectorDisp: "Energy", longname: "Mid" },
      ],
    };
    const res = parseSearchResponse(json, "X");
    expect(res.status === "OK" && res.fields.yahooSymbol).toBe("MID.L");
    expect(res.status === "OK" && res.fields.sector).toBe("Energy");
  });

  it("falls back to the first entry when no quote has a sectorDisp", () => {
    const json = {
      quotes: [
        { symbol: "A.SG", score: 1, quoteType: "EQUITY" },
        { symbol: "B.SG", score: 2, quoteType: "EQUITY" },
      ],
    };
    const res = parseSearchResponse(json, "X");
    expect(res.status === "OK" && res.fields.yahooSymbol).toBe("A.SG");
  });

  it("returns NOT_FOUND on empty or missing quotes[]", () => {
    expect(parseSearchResponse({ quotes: [] }, "X").status).toBe("NOT_FOUND");
    expect(parseSearchResponse({}, "X").status).toBe("NOT_FOUND");
  });
});

describe("parseChartMeta", () => {
  it("normalizes GBp (pence) to GBP, dividing the price by 100", () => {
    const q = parseChartMeta(chartTrnFixture);
    expect(q).not.toBeNull();
    expect(q?.currency).toBe("GBP");
    expect(q?.close).toBe("2.18"); // 218.0 GBp / 100
    expect(q?.source).toBe("YAHOO");
    expect(q?.date).toBe(new Date(1783092925 * 1000).toISOString().slice(0, 10));
  });

  it("passes a non-GBp currency (EUR) through unchanged", () => {
    const q = parseChartMeta(chartSgFixture);
    expect(q?.currency).toBe("EUR");
    expect(q?.close).toBe("2.54");
    expect(q?.source).toBe("YAHOO");
  });

  it("returns null when meta or price is missing", () => {
    expect(parseChartMeta(null)).toBeNull();
    expect(parseChartMeta({ chart: { result: [] } })).toBeNull();
    expect(
      parseChartMeta({ chart: { result: [{ meta: { currency: "USD" } }] } }),
    ).toBeNull();
  });
});

describe("yahooProvider.fetchMeta", () => {
  const origFetch = globalThis.fetch;
  const ref: InstrumentRef = { isin: "GB00BKDTK925", symbol: "TRN.L", currency: "EUR" };

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("returns OK by fetching the search endpoint", async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify(searchFixture), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    ) as typeof globalThis.fetch;

    const res = await yahooProvider.fetchMeta(ref);
    expect(res.status).toBe("OK");
    expect(res.status === "OK" && res.fields.yahooSymbol).toBe("TRN.L");
  });

  it("returns ERROR when fetch throws", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as typeof globalThis.fetch;

    const res = await yahooProvider.fetchMeta(ref);
    expect(res.status).toBe("ERROR");
    expect(res.status === "ERROR" && res.error).toContain("network down");
  });

  it("returns ERROR on a non-OK HTTP response", async () => {
    globalThis.fetch = vi.fn(
      async () => new Response("nope", { status: 503 }),
    ) as typeof globalThis.fetch;

    const res = await yahooProvider.fetchMeta(ref);
    expect(res.status).toBe("ERROR");
  });
});
