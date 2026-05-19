import { describe, it, expect } from "vitest";
import { computeUnrealizedPnL } from "@/lib/positions/unrealized-pnl";

/**
 * Dual-view P/L: `broker` mode mirrors brokerage UI cost-basis math
 * (gross trade total, fees excluded). `net` mode keeps the previous
 * behaviour — Anschaffungskosten-style cost including fees. Dividends
 * are layered in by the position accessor on top of `net`; they are
 * NOT part of `computeUnrealizedPnL`, which only cares about open lots.
 */

const fx = (rates: Record<string, number>) => new Map(Object.entries(rates));

describe("dual-view P/L", () => {
  it("broker mode excludes fees from cost basis (the O.US case)", () => {
    // User's real O.US lot: 35 shares from 2025-09-15, proceeds $2105.89,
    // fee $10.56. FF "Entry Price × qty" reports $2,105.89.
    const r = computeUnrealizedPnL({
      lots: [{ remainingQty: "35", originalQty: "35", proceeds: "-2105.89", fee: "-10.56" }],
      tradeCurrency: "USD",
      lastPrice: 61.98,
      quoteCurrency: "USD",
      fxRatesPerEur: fx({ USD: 1.17 }),
    });
    expect(r!.broker.costBasisNative).toBeCloseTo(2105.89, 2);
    expect(r!.broker.unrealizedPnlNative).toBeCloseTo(63.41, 1); // matches FF
    expect(r!.broker.avgPriceNative).toBeCloseTo(60.1683, 3);
  });

  it("net mode includes fees in cost basis (German Anschaffungskosten)", () => {
    const r = computeUnrealizedPnL({
      lots: [{ remainingQty: "35", originalQty: "35", proceeds: "-2105.89", fee: "-10.56" }],
      tradeCurrency: "USD",
      lastPrice: 61.98,
      quoteCurrency: "USD",
      fxRatesPerEur: fx({ USD: 1.17 }),
    });
    expect(r!.net.costBasisNative).toBeCloseTo(2116.45, 2);
    expect(r!.net.unrealizedPnlNative).toBeCloseTo(52.85, 1);
    expect(r!.net.avgPriceNative).toBeCloseTo(60.4700, 3);
  });

  it("broker and net agree when fees are zero", () => {
    const r = computeUnrealizedPnL({
      lots: [{ remainingQty: "10", originalQty: "10", proceeds: "-1000", fee: "0" }],
      tradeCurrency: "USD",
      lastPrice: 110,
      quoteCurrency: "USD",
      fxRatesPerEur: fx({ USD: 1.10 }),
    });
    expect(r!.broker.costBasisNative).toBe(r!.net.costBasisNative);
    expect(r!.broker.unrealizedPnlNative).toBe(r!.net.unrealizedPnlNative);
    expect(r!.broker.avgPriceNative).toBe(r!.net.avgPriceNative);
  });

  it("partial-close lots scale fees the same way they scale cost", () => {
    // Bought 50 for $3000 + $15 fee; sold 15; 35 still open.
    // broker cost = 3000 × 35/50 = 2100
    // net    cost = 3015 × 35/50 = 2110.50
    const r = computeUnrealizedPnL({
      lots: [{ remainingQty: "35", originalQty: "50", proceeds: "-3000", fee: "-15" }],
      tradeCurrency: "USD",
      lastPrice: 70,
      quoteCurrency: "USD",
      fxRatesPerEur: fx({ USD: 1.10 }),
    });
    expect(r!.broker.costBasisNative).toBeCloseTo(2100, 2);
    expect(r!.net.costBasisNative).toBeCloseTo(2110.5, 2);
    // Both views: market = 35 × 70 = 2450
    expect(r!.broker.unrealizedPnlNative).toBeCloseTo(350, 2);
    expect(r!.net.unrealizedPnlNative).toBeCloseTo(339.5, 2);
  });

  it("multi-lot aggregates fees correctly under each view", () => {
    const r = computeUnrealizedPnL({
      lots: [
        { remainingQty: "10", originalQty: "10", proceeds: "-500", fee: "-5" },
        { remainingQty: "5",  originalQty: "5",  proceeds: "-300", fee: "-3" },
      ],
      tradeCurrency: "USD",
      lastPrice: 60,
      quoteCurrency: "USD",
      fxRatesPerEur: fx({ USD: 1.10 }),
    });
    expect(r!.broker.costBasisNative).toBe(800);           // 500 + 300
    expect(r!.net.costBasisNative).toBeCloseTo(808, 2);    // 505 + 303
    // Market = 15 × 60 = 900
    expect(r!.broker.unrealizedPnlNative).toBe(100);
    expect(r!.net.unrealizedPnlNative).toBeCloseTo(92, 2);
  });

  it("both views share qty and approximated flags", () => {
    const r = computeUnrealizedPnL({
      lots: [{ remainingQty: "12.1158", originalQty: "12.1158", proceeds: "-620", fee: "-6" }],
      tradeCurrency: "EUR",
      lastPrice: 52.64,
      quoteCurrency: "GBP", // cross-currency: should flag `approximated`
      fxRatesPerEur: fx({ GBP: 0.86, USD: 1.16 }),
    });
    expect(r!.qty).toBeCloseTo(12.1158, 4);
    expect(r!.approximated).toBe(true);
    // market in EUR — same for both views
    expect(r!.broker.marketValueNative).toBe(r!.net.marketValueNative);
  });

  it("pct is computed against the relevant cost basis (gross for broker, with-fees for net)", () => {
    const r = computeUnrealizedPnL({
      lots: [{ remainingQty: "100", originalQty: "100", proceeds: "-1000", fee: "-100" }],
      tradeCurrency: "USD",
      lastPrice: 12,
      quoteCurrency: "USD",
      fxRatesPerEur: fx({ USD: 1 }),
    });
    // broker: gross cost 1000, market 1200, pnl 200, pct 20%
    // net:    cost 1100, pnl 100, pct ~9.09%
    expect(r!.broker.unrealizedPctNative).toBeCloseTo(20, 2);
    expect(r!.net.unrealizedPctNative).toBeCloseTo(9.0909, 2);
  });
});
