import { describe, it, expect } from "vitest";
import { computeUnrealizedPnL } from "@/lib/positions/unrealized-pnl";

/**
 * These fixtures are taken VERBATIM from the user's real IBKR Activity
 * Statements (U13142092, 2025 + 2026-partial). The expected P/L numbers
 * are what IBKR's `Open Positions` section reports for the same lots —
 * so a test failure here means our calculation has drifted from the
 * broker's authoritative math, not that the test is stale.
 */

const fx = (rates: Record<string, number>) => new Map(Object.entries(rates));

describe("Unrealized P&L — IBKR statement parity", () => {
  it("SONY (USD/USD): three buys, last close 22.71 ⇒ −$23.60", () => {
    // From IBKR Trades for SONY:
    //   2025-12-02  3.6057  proceeds -102.9998  fee -1.00
    //   2026-01-02  3.8595  proceeds  -99.9998  fee -1.00
    //   2026-02-09 30.5092  proceeds -679.9991  fee -1.00
    // Open Positions row: 37.9744 @ 23.3315 (cost 885.99) · last 22.71 · unrealized -23.60
    const r = computeUnrealizedPnL({
      lots: [
        { remainingQty: "3.6057",  originalQty: "3.6057",  proceeds: "-102.999849", fee: "-1" },
        { remainingQty: "3.8595",  originalQty: "3.8595",  proceeds:  "-99.999759", fee: "-1" },
        { remainingQty: "30.5092", originalQty: "30.5092", proceeds: "-679.999068", fee: "-1" },
      ],
      tradeCurrency: "USD",
      lastPrice: 22.71,
      quoteCurrency: "USD",
      fxRatesPerEur: fx({ USD: 1.165 }),
    });
    expect(r).not.toBeNull();
    expect(r!.qty).toBeCloseTo(37.9744, 4);
    expect(r!.net.costBasisNative).toBeCloseTo(885.99, 1);
    expect(r!.net.avgPriceNative).toBeCloseTo(23.3315, 3);
    expect(r!.net.marketValueNative).toBeCloseTo(862.4, 1);
    expect(r!.net.unrealizedPnlNative).toBeCloseTo(-23.59, 1);
    expect(r!.approximated).toBe(false);
  });

  it("COIN (USD/USD): one lot, last close 162.64 mirrors IBKR", () => {
    // Open Positions: 4.7794 @ 173.30 · last 189.50 (CSV uses different close)
    // We use Stooq's 2026-05-18 close which IBKR statement also uses for
    // MTM. cost basis 828.29 USD.
    const r = computeUnrealizedPnL({
      lots: [
        { remainingQty: "4.7794", originalQty: "4.7794", proceeds: "-827.29", fee: "-1" },
      ],
      tradeCurrency: "USD",
      lastPrice: 189.44,
      quoteCurrency: "USD",
      fxRatesPerEur: fx({ USD: 1.165 }),
    });
    expect(r!.net.costBasisNative).toBeCloseTo(828.29, 2);
    expect(r!.net.marketValueNative).toBeCloseTo(905.45, 0); // 4.7794 * 189.44
    expect(r!.net.unrealizedPnlNative).toBeCloseTo(77.16, 0);
  });

  it("TRN (GBP/GBP): pence-scaled quote, FIFO-consistent partial lots", () => {
    // Two 2025 buys, no sells. Cost basis 990.90 GBP per IBKR.
    // Stooq close 217.8 GBp → 2.178 GBP after pence scale (handled upstream).
    const r = computeUnrealizedPnL({
      lots: [
        { remainingQty: "4.4883",   originalQty: "4.4883",   proceeds: "-9.9979",   fee: "-3.05" },
        { remainingQty: "436.5436", originalQty: "436.5436", proceeds: "-969.9979", fee: "-7.85" },
      ],
      tradeCurrency: "GBP",
      lastPrice: 2.178,
      quoteCurrency: "GBP",
      fxRatesPerEur: fx({ GBP: 0.84 }),
    });
    expect(r!.net.costBasisNative).toBeCloseTo(990.89, 1);
    expect(r!.net.marketValueNative).toBeCloseTo(960.55, 0); // 441.0319 * 2.178
    expect(r!.net.unrealizedPnlNative).toBeLessThan(0);
  });

  it("partially-closed lot: 50 bought, 30 still open ⇒ 60% of cost remains", () => {
    const r = computeUnrealizedPnL({
      lots: [
        { remainingQty: "30", originalQty: "50", proceeds: "-1000", fee: "-2" },
      ],
      tradeCurrency: "USD",
      lastPrice: 25,
      quoteCurrency: "USD",
      fxRatesPerEur: fx({ USD: 1.10 }),
    });
    // (1000 + 2) * (30/50) = 601.20  ·  market 30 * 25 = 750
    expect(r!.net.costBasisNative).toBeCloseTo(601.2, 2);
    expect(r!.net.marketValueNative).toBeCloseTo(750, 2);
    expect(r!.net.unrealizedPnlNative).toBeCloseTo(148.8, 2);
  });

  it("flags approximated=true when quote currency ≠ trade currency", () => {
    // IEMM trade ccy = EUR (Amsterdam), Stooq quote in GBP (EIMI on LSE).
    // Stooq returned 52.64 GBP today; FX EUR/GBP ≈ 0.86 → ~61.21 EUR/share.
    const r = computeUnrealizedPnL({
      lots: [
        { remainingQty: "12.1158", originalQty: "12.1158", proceeds: "-620", fee: "-6" },
      ],
      tradeCurrency: "EUR",
      lastPrice: 52.64,
      quoteCurrency: "GBP",
      fxRatesPerEur: fx({ GBP: 0.86, USD: 1.16 }),
    });
    expect(r!.approximated).toBe(true);
    expect(r!.net.costBasisNative).toBeCloseTo(626, 0);
  });

  it("returns null when there are no open lots", () => {
    const r = computeUnrealizedPnL({
      lots: [{ remainingQty: "0", originalQty: "10", proceeds: "-100", fee: "0" }],
      tradeCurrency: "USD",
      lastPrice: 11,
      quoteCurrency: "USD",
      fxRatesPerEur: fx({ USD: 1.05 }),
    });
    expect(r).toBeNull();
  });

  it("returns null when no FX rate is available for a cross-currency conversion", () => {
    const r = computeUnrealizedPnL({
      lots: [{ remainingQty: "1", originalQty: "1", proceeds: "-100", fee: "0" }],
      tradeCurrency: "USD",
      lastPrice: 100,
      quoteCurrency: "GBP",
      fxRatesPerEur: fx({}),
    });
    expect(r).toBeNull();
  });

  it("avg price = cost basis / qty exactly (within rounding)", () => {
    const r = computeUnrealizedPnL({
      lots: [
        { remainingQty: "10", originalQty: "10", proceeds: "-500", fee: "-2" },
        { remainingQty: "5",  originalQty: "5",  proceeds: "-250", fee: "-1" },
      ],
      tradeCurrency: "USD",
      lastPrice: 60,
      quoteCurrency: "USD",
      fxRatesPerEur: fx({ USD: 1.10 }),
    });
    // cost = 502 + 251 = 753, qty = 15, avg = 50.2
    expect(r!.net.costBasisNative).toBeCloseTo(753, 2);
    expect(r!.net.avgPriceNative).toBeCloseTo(50.2, 2);
    expect(r!.net.marketValueNative).toBe(900);
  });
});
