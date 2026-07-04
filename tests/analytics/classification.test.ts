import { describe, it, expect } from "vitest";
import { buildClassificationOverrides } from "@/lib/analytics/classification";
import type { InstrumentMeta } from "@/lib/marketdata/types";

function meta(partial: Partial<InstrumentMeta> & { isin: string }): InstrumentMeta {
  return {
    isin: partial.isin,
    status: partial.status ?? "OK",
    source: partial.source ?? "YAHOO",
    assetKind: "assetKind" in partial ? partial.assetKind ?? null : "stock",
    manualUrl: null,
    failCount: 0,
    scrapedAt: null,
    updatedAt: "2026-07-04T00:00:00Z",
    name: partial.name ?? null,
    sector: partial.sector ?? null,
    industry: partial.industry ?? null,
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
    distributionPolicy: partial.distributionPolicy ?? null,
    distributionFrequency: partial.distributionFrequency ?? null,
    teilfreistellungPct: null,
    fundSubtype: partial.fundSubtype ?? null,
  };
}

describe("buildClassificationOverrides", () => {
  it("maps a symbol to its ETF classification via real ISIN", () => {
    const instruments = [{ symbol: "IEMM", isin: "IE00B0M63177" }];
    const metas = [
      meta({
        isin: "IE00B0M63177",
        assetKind: "etf",
        sector: "Emerging Markets",
        fundSubtype: "aktien",
        distributionPolicy: "DISTRIBUTING",
        distributionFrequency: "Quarterly",
      }),
    ];
    const map = buildClassificationOverrides(instruments, metas);
    const o = map.get("IEMM");
    expect(o?.kind).toBe("etf");
    expect(o?.sector).toBe("Emerging Markets");
    expect(o?.subtype).toBe("aktien");
    expect(o?.distribution).toEqual({ policy: "DISTRIBUTING", frequency: "Quarterly" });
  });

  it("ignores non-OK metadata rows", () => {
    const instruments = [{ symbol: "XXX", isin: "IE00B0M63177" }];
    const metas = [meta({ isin: "IE00B0M63177", status: "NOT_FOUND", assetKind: null })];
    expect(buildClassificationOverrides(instruments, metas).has("XXX")).toBe(false);
  });

  it("ignores OK rows without a resolved assetKind", () => {
    const instruments = [{ symbol: "XXX", isin: "IE00B0M63177" }];
    const metas = [meta({ isin: "IE00B0M63177", status: "OK", assetKind: null })];
    expect(buildClassificationOverrides(instruments, metas).has("XXX")).toBe(false);
  });

  it("matches a manual-linked symbol via the synthetic SYM: key", () => {
    const instruments = [{ symbol: "TRN.L", isin: null }];
    const metas = [meta({ isin: "SYM:TRN.L", assetKind: "stock", sector: "Consumer Cyclical" })];
    const o = buildClassificationOverrides(instruments, metas).get("TRN.L");
    expect(o?.kind).toBe("stock");
    expect(o?.sector).toBe("Consumer Cyclical");
  });

  it("leaves distribution null when policy is unknown", () => {
    const instruments = [{ symbol: "AAA", isin: "IE00B0M63177" }];
    const metas = [meta({ isin: "IE00B0M63177", assetKind: "etf" })];
    expect(buildClassificationOverrides(instruments, metas).get("AAA")?.distribution).toBeNull();
  });

  it("skips instrument rows with no symbol", () => {
    const instruments = [{ symbol: null, isin: "IE00B0M63177" }];
    const metas = [meta({ isin: "IE00B0M63177", assetKind: "etf" })];
    expect(buildClassificationOverrides(instruments, metas).size).toBe(0);
  });

  it("uses the broker-declared kind when no meta row exists", () => {
    const instruments = [{ symbol: "SCHD", isin: "US8085247976", kind: "etf" }];
    const o = buildClassificationOverrides(instruments, []).get("SCHD");
    expect(o?.kind).toBe("etf");
    expect(o?.sector).toBeNull();
    expect(o?.subtype).toBeNull();
    expect(o?.distribution).toBeNull();
  });

  it("prefers an OK meta row over the broker-declared kind", () => {
    const instruments = [{ symbol: "SCHD", isin: "US8085247976", kind: "stock" }];
    const metas = [
      meta({ isin: "US8085247976", assetKind: "etf", sector: "Dividend", fundSubtype: "aktien" }),
    ];
    const o = buildClassificationOverrides(instruments, metas).get("SCHD");
    expect(o?.kind).toBe("etf");
    expect(o?.sector).toBe("Dividend");
    expect(o?.subtype).toBe("aktien");
  });

  it("ignores an invalid broker kind string", () => {
    const instruments = [{ symbol: "XXX", isin: "US8085247976", kind: "фонд/ETF" }];
    expect(buildClassificationOverrides(instruments, []).has("XXX")).toBe(false);
  });
});
