/**
 * Yahoo quote-symbol candidates for a held instrument.
 *
 * The dangerous default was pricing a non-US instrument off its BARE broker
 * symbol: on Yahoo "TRN" is Trinity Industries (US), not Trainline (LSE TRN.L)
 * — a wrong-company price. We derive the listing from the ISIN country suffix
 * instead, and never fall back to the bare symbol for a non-US ISIN.
 */
import { describe, it, expect } from "vitest";
import { yahooQuoteCandidates, manualListingCandidates } from "@/lib/marketdata/yahoo-listing";
import type { InstrumentMeta, InstrumentRef } from "@/lib/marketdata/types";

const ref = (isin: string, symbol: string): InstrumentRef => ({ isin, symbol, currency: null });
function meta(over: Partial<InstrumentMeta>): InstrumentMeta {
  return {
    isin: "X", status: "OK", source: null, assetKind: null, manualUrl: null, failCount: 0,
    scrapedAt: null, updatedAt: "", name: null, sector: null, industry: null, yahooSymbol: null,
    yahooQuoteSymbol: null, justetfTicker: null, wkn: null, fundCurrency: null, domicile: null,
    indexName: null, investmentFocus: null, replication: null, terPct: null, distributionPolicy: null,
    distributionFrequency: null, teilfreistellungPct: null, fundSubtype: null, ...over,
  } as InstrumentMeta;
}

describe("yahooQuoteCandidates", () => {
  it("derives the LSE listing for a GB stock and never uses the bare symbol", () => {
    expect(yahooQuoteCandidates(ref("GB00BKDTK925", "TRN"), null)).toEqual(["TRN.L"]);
  });

  it("uses the bare symbol for a US instrument", () => {
    expect(yahooQuoteCandidates(ref("US09571B1061", "BLBD"), null)).toEqual(["BLBD"]);
  });

  it("uses the bare symbol for a synthetic (symbol-pinned) ISIN", () => {
    expect(yahooQuoteCandidates(ref("SYM:FOO", "FOO"), null)).toEqual(["FOO"]);
  });

  it("prefers meta's pinned listings, then the derived suffix, deduped", () => {
    const m = meta({ yahooQuoteSymbol: "GB00BKDTK925.SG", yahooSymbol: "TRN.L" });
    expect(yahooQuoteCandidates(ref("GB00BKDTK925", "TRN"), m)).toEqual(["GB00BKDTK925.SG", "TRN.L"]);
  });

  it("returns no guess for a non-US ISIN whose exchange we don't map", () => {
    expect(yahooQuoteCandidates(ref("ZZ0000000001", "FOO"), null)).toEqual([]);
  });
});

describe("manualListingCandidates", () => {
  it("tries the user's pinned listing first, then the derived primary listing", () => {
    // A thin venue (Stuttgart .SG) that may have no chart data → fall back to
    // the LSE primary before giving up.
    expect(manualListingCandidates(ref("GB00BKDTK925", "TRN"), "GB00BKDTK925.SG"))
      .toEqual(["GB00BKDTK925.SG", "TRN.L"]);
  });

  it("dedupes when the pin already is the primary listing", () => {
    expect(manualListingCandidates(ref("GB00BKDTK925", "TRN"), "TRN.L")).toEqual(["TRN.L"]);
  });

  it("just the pinned symbol for a US name (no country fallback)", () => {
    expect(manualListingCandidates(ref("US09571B1061", "BLBD"), "BLBD")).toEqual(["BLBD"]);
  });
});
