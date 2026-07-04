import { describe, it, expect } from "vitest";
import { planEnrichment, planQuote } from "@/lib/marketdata/router";
import type { InstrumentRef, InstrumentMeta, ManualLink } from "@/lib/marketdata/types";

function ref(isin: string, symbol = "X"): InstrumentRef {
  return { isin, symbol, currency: null };
}

function meta(over: Partial<InstrumentMeta>): InstrumentMeta {
  return {
    isin: "X",
    status: "OK",
    source: null,
    assetKind: null,
    manualUrl: null,
    failCount: 0,
    scrapedAt: null,
    updatedAt: "2026-01-01T00:00:00Z",
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

describe("planEnrichment", () => {
  it("US ISIN → [fmp, yahoo]", () => {
    expect(planEnrichment(ref("US0378331005"), null)).toEqual(["fmp", "yahoo"]);
  });

  it("non-US ISIN → [justetf, yahoo]", () => {
    expect(planEnrichment(ref("IE00B0M63177"), null)).toEqual(["justetf", "yahoo"]);
  });

  it("manual justetf link short-circuits → [justetf]", () => {
    const manual: ManualLink = { provider: "justetf", isin: "IE00B0M63177" };
    expect(planEnrichment(ref("US0378331005"), manual)).toEqual(["justetf"]);
  });

  it("manual yahoo link short-circuits → [yahoo]", () => {
    const manual: ManualLink = { provider: "yahoo", yahooSymbol: "TRN.L" };
    expect(planEnrichment(ref("IE00B0M63177"), manual)).toEqual(["yahoo"]);
  });
});

describe("planQuote", () => {
  it("JUSTETF-sourced ETF meta → [justetf]", () => {
    expect(planQuote(ref("IE00B0M63177"), meta({ source: "JUSTETF", assetKind: "etf" }))).toEqual([
      "justetf",
    ]);
  });

  it("US ISIN → [fmp, yahoo]", () => {
    expect(planQuote(ref("US0378331005"), null)).toEqual(["fmp", "yahoo"]);
  });

  it("synthetic ISIN (SYM:) → [fmp, yahoo]", () => {
    expect(planQuote(ref("SYM:TRN.L"), null)).toEqual(["fmp", "yahoo"]);
  });

  it("empty ISIN → [fmp, yahoo]", () => {
    expect(planQuote(ref(""), null)).toEqual(["fmp", "yahoo"]);
  });

  it("plain non-US stock (YAHOO/stock meta) → [yahoo]", () => {
    expect(planQuote(ref("GB00BKDTK925"), meta({ source: "YAHOO", assetKind: "stock" }))).toEqual([
      "yahoo",
    ]);
  });

  it("JUSTETF source but non-etf kind is not special-cased → [yahoo]", () => {
    expect(planQuote(ref("GB00BKDTK925"), meta({ source: "JUSTETF", assetKind: "stock" }))).toEqual(
      ["yahoo"],
    );
  });
});
