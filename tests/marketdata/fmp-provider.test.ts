import { describe, it, expect, vi, afterEach } from "vitest";
import { fmpProvider, parseFmpProfile } from "@/lib/marketdata/providers/fmp";
import type { InstrumentRef } from "@/lib/marketdata/types";

const REF: InstrumentRef = { isin: "US0378331005", symbol: "AAPL", currency: "USD" };

describe("parseFmpProfile", () => {
  it("maps a plain equity profile to assetKind 'stock' with sector/industry/name", () => {
    const json = [
      {
        companyName: "Apple Inc.",
        sector: "Technology",
        industry: "Consumer Electronics",
        isEtf: false,
        isFund: false,
      },
    ];
    const parsed = parseFmpProfile(json);
    expect(parsed?.assetKind).toBe("stock");
    expect(parsed?.fields.sector).toBe("Technology");
    expect(parsed?.fields.industry).toBe("Consumer Electronics");
    expect(parsed?.fields.name).toBe("Apple Inc.");
  });

  it("maps isEtf → 'etf'", () => {
    const json = [
      { companyName: "SPDR S&P 500 ETF Trust", sector: "", industry: "", isEtf: true, isFund: false },
    ];
    expect(parseFmpProfile(json)?.assetKind).toBe("etf");
  });

  it("maps isFund → 'other'", () => {
    const json = [
      { companyName: "Some Mutual Fund", sector: "", industry: "", isEtf: false, isFund: true },
    ];
    expect(parseFmpProfile(json)?.assetKind).toBe("other");
  });

  it("returns null on an empty array (symbol unknown to FMP)", () => {
    expect(parseFmpProfile([])).toBeNull();
  });

  it("returns null on a non-array (error envelope)", () => {
    expect(parseFmpProfile({ "Error Message": "Invalid API key" })).toBeNull();
  });
});

describe("fmpProvider.fetchMeta", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
    delete process.env.FMP_API_KEY;
  });

  it("returns OK with the parsed sector for a known symbol", async () => {
    process.env.FMP_API_KEY = "test";
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            companyName: "Apple Inc.",
            sector: "Technology",
            industry: "Consumer Electronics",
            isEtf: false,
            isFund: false,
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as typeof globalThis.fetch;

    const res = await fmpProvider.fetchMeta(REF);
    expect(res.status).toBe("OK");
    if (res.status === "OK") {
      expect(res.source).toBe("FMP");
      expect(res.assetKind).toBe("stock");
      expect(res.fields.sector).toBe("Technology");
    }
  });

  it("hits /stable/profile with the symbol and apikey query params", async () => {
    process.env.FMP_API_KEY = "test";
    let calledUrl = "";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      calledUrl = String(input);
      return new Response(
        JSON.stringify([{ companyName: "Apple Inc.", isEtf: false, isFund: false }]),
        { status: 200 },
      );
    }) as typeof globalThis.fetch;

    await fmpProvider.fetchMeta(REF);
    expect(calledUrl).toContain("/stable/profile?");
    expect(calledUrl).toContain("symbol=AAPL");
    expect(calledUrl).toContain("apikey=test");
  });

  it("returns ERROR 'FMP not configured' when FMP_API_KEY is unset (no HTTP call)", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as typeof globalThis.fetch;
    const res = await fmpProvider.fetchMeta(REF);
    expect(res).toEqual({ status: "ERROR", error: "FMP not configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND on an empty array response", async () => {
    process.env.FMP_API_KEY = "test";
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify([]), { status: 200 }),
    ) as typeof globalThis.fetch;

    const res = await fmpProvider.fetchMeta(REF);
    expect(res.status).toBe("NOT_FOUND");
  });

  it("returns ERROR when fetch throws", async () => {
    process.env.FMP_API_KEY = "test";
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as typeof globalThis.fetch;

    const res = await fmpProvider.fetchMeta(REF);
    expect(res.status).toBe("ERROR");
    if (res.status === "ERROR") expect(res.error).toBe("network down");
  });
});

describe("fmpProvider.fetchQuote", () => {
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
    delete process.env.FMP_API_KEY;
  });

  it("maps the /stable/quote result to a QuoteResult with source FMP", async () => {
    process.env.FMP_API_KEY = "test";
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify([
          { symbol: "AAPL", price: 190.5, timestamp: 1700000000 },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as typeof globalThis.fetch;

    const res = await fmpProvider.fetchQuote(REF, null);
    expect(res).not.toBeNull();
    expect(res?.close).toBe("190.50");
    expect(res?.currency).toBe("USD");
    expect(res?.source).toBe("FMP");
  });

  it("returns null when FMP returns no quote", async () => {
    process.env.FMP_API_KEY = "test";
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify([]), { status: 200 }),
    ) as typeof globalThis.fetch;

    const res = await fmpProvider.fetchQuote(REF, null);
    expect(res).toBeNull();
  });
});
