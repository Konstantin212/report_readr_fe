import { describe, it, expect } from "vitest";
import { sortRows, heroSummary, sectorAllocation } from "@/lib/analytics/positions-view";
import type { PositionRow, PositionsData } from "@/lib/data/positions";

const row = (over: Partial<PositionRow>): PositionRow => ({
  symbol: "X",
  name: "X",
  broker: "FF",
  currency: "EUR",
  sector: "Tech",
  kind: "stock",
  qty: 1,
  pricePerUnitEur: 1,
  marketEur: 100,
  asOf: null,
  quoteSource: null,
  quoteUpdatedAt: null,
  nativeCurrency: "EUR",
  pricePerUnitNative: null,
  marketNative: null,
  dividendsEur: 0,
  dividendsNative: 0,
  feesEur: 0,
  distribution: null,
  formerTickers: [],
  fifoLots: [],
  views: {
    broker: { avgCostEur: 1, costEur: 90, plEur: 10, plPct: 11.1, avgCostNative: null, costNative: null, plNative: null },
    net: { avgCostEur: 1, costEur: 95, plEur: 5, plPct: 5.3, avgCostNative: null, costNative: null, plNative: null },
  },
  ...over,
} as PositionRow);

describe("sortRows", () => {
  it("sorts by value desc", () => {
    const r = sortRows(
      [row({ symbol: "A", marketEur: 50 }), row({ symbol: "B", marketEur: 200 })],
      "value",
      "net",
    );
    expect(r.map((x) => x.symbol)).toEqual(["B", "A"]);
  });

  it("sorts by gain desc using the active mode", () => {
    const rows = [
      row({ symbol: "A", views: { ...row({}).views, net: { ...row({}).views.net, plEur: 1 } } }),
      row({ symbol: "B", views: { ...row({}).views, net: { ...row({}).views.net, plEur: 99 } } }),
    ];
    expect(sortRows(rows, "gain", "net").map((x) => x.symbol)).toEqual(["B", "A"]);
  });

  it("sorts az alphabetically", () => {
    const rows = [row({ symbol: "B" }), row({ symbol: "A" })];
    expect(sortRows(rows, "az", "net").map((x) => x.symbol)).toEqual(["A", "B"]);
  });

  it("handles a null marketEur without throwing", () => {
    expect(() => sortRows([row({ marketEur: null })], "value", "net")).not.toThrow();
  });
});

const data = (rows: PositionRow[]): PositionsData =>
  ({
    rows,
    rowsByKind: { stock: rows, etf: [], bond: [], other: [] },
    total: rows.length,
    totalMarketEur: rows.reduce((s, r) => s + (r.marketEur ?? 0), 0),
    totalPlEur: rows.reduce((s, r) => s + (r.views.net.plEur ?? 0), 0),
    sectors: [...new Set(rows.map((r) => r.sector))],
    cash: [],
  }) as unknown as PositionsData;

describe("heroSummary", () => {
  it("returns market, pl, and pl% over cost", () => {
    const s = heroSummary(data([row({ marketEur: 110, views: { ...row({}).views, net: { ...row({}).views.net, plEur: 5 } } })]));
    expect(s.marketEur).toBe(110);
    expect(s.plEur).toBe(5);
    expect(s.plPct).toBeCloseTo((5 / 105) * 100, 4);
  });

  it("plPct is null when cost is zero", () => {
    const d = data([
      row({ marketEur: 0, views: { ...row({}).views, net: { ...row({}).views.net, plEur: 0 } } }),
    ]);
    expect(heroSummary(d).plPct).toBeNull();
  });
});

describe("sectorAllocation", () => {
  it("aggregates market value per sector, desc, with pct", () => {
    const d = data([row({ sector: "Tech", marketEur: 300 }), row({ sector: "Energy", marketEur: 100 })]);
    const a = sectorAllocation(d);
    expect(a[0]).toMatchObject({ name: "Tech", value: 300, pct: 75 });
    expect(a[1]).toMatchObject({ name: "Energy", value: 100, pct: 25 });
  });
});
