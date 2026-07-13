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

  it("US ISIN → [fmp, finviz] (finviz replaces the Vercel-blocked Yahoo path)", () => {
    expect(planQuote(ref("US0378331005"), null)).toEqual(["fmp", "finviz"]);
  });

  it("synthetic ISIN (SYM:) → [fmp, finviz]", () => {
    expect(planQuote(ref("SYM:TRN.L"), null)).toEqual(["fmp", "finviz"]);
  });

  it("empty ISIN → [fmp, finviz]", () => {
    expect(planQuote(ref(""), null)).toEqual(["fmp", "finviz"]);
  });

  it("plain non-US stock (YAHOO/stock meta) → [yahoo, justetf]", () => {
    expect(planQuote(ref("GB00BKDTK925"), meta({ source: "YAHOO", assetKind: "stock" }))).toEqual([
      "yahoo",
      "justetf",
    ]);
  });

  it("manual Google Finance link (by stored manualUrl) → [googlefinance]", () => {
    expect(
      planQuote(ref("GB00BKDTK925"), meta({ manualUrl: "https://www.google.com/finance/quote/TRN:LON" })),
    ).toEqual(["googlefinance"]);
  });

  it("JUSTETF-sourced non-ETF (e.g. RY4C, an EU stock justETF prices) → [justetf]", () => {
    expect(planQuote(ref("IE00BYTBXV33"), meta({ source: "JUSTETF", assetKind: "stock" }))).toEqual(
      ["justetf"],
    );
  });
});
