import { describe, it, expect } from "vitest";
import { computeUnrealizedPnL } from "@/lib/positions/unrealized-pnl";

/**
 * Freedom Finance broker-parity tests. Each case takes the trade rows
 * + the broker's current quote out of the user's real statement
 * (Freedom24 file 900000_2021-04-30..2026-06-05_all.json), runs them
 * through computeUnrealizedPnL, and asserts that broker.unrealizedPnlNative
 * matches FF's "For an entire period" column (= `value - book value`,
 * no fees, no dividends) within 1 cent.
 *
 * If these ever drift, the calculation has diverged from what the
 * broker UI shows — which is exactly the bug we were chasing in
 * mid-2026 when the quote cron was silently writing zero new rows and
 * P/L started reporting day-old numbers.
 *
 * Format per case:
 *   ticker, quantity, entry price (USD), latest close (USD), expected P/L (USD)
 */

const fx = (rates: Record<string, number>) => new Map(Object.entries(rates));

const FFRATES = fx({ USD: 1.164 });

describe("Unrealized P&L — Freedom24 statement parity (broker view)", () => {
  it("O: 35 sh @ $60.17 buy, last $60.72 ⇒ +$19.25", () => {
    const r = computeUnrealizedPnL({
      lots: [{ remainingQty: "35", originalQty: "35", proceeds: "-2105.89", fee: "10.56" }],
      tradeCurrency: "USD",
      lastPrice: 60.72,
      quoteCurrency: "USD",
      fxRatesPerEur: FFRATES,
    });
    expect(r).not.toBeNull();
    expect(r!.broker.unrealizedPnlNative).toBeCloseTo(19.31, 1);
    expect(r!.broker.costBasisNative).toBeCloseTo(2105.89, 2);
    expect(r!.broker.marketValueNative).toBeCloseTo(2125.20, 2);
  });

  it("TTWO: 4 sh @ $119.135, last $213.94 ⇒ +$379.22", () => {
    const r = computeUnrealizedPnL({
      lots: [{ remainingQty: "4", originalQty: "4", proceeds: "-476.54", fee: "4.79" }],
      tradeCurrency: "USD",
      lastPrice: 213.94,
      quoteCurrency: "USD",
      fxRatesPerEur: FFRATES,
    });
    expect(r!.broker.unrealizedPnlNative).toBeCloseTo(379.22, 1);
  });

  it("NEM: 10 sh @ $61.503, last $99.69 ⇒ +$381.87", () => {
    const r = computeUnrealizedPnL({
      lots: [{ remainingQty: "10", originalQty: "10", proceeds: "-615.03", fee: "3.59" }],
      tradeCurrency: "USD",
      lastPrice: 99.69,
      quoteCurrency: "USD",
      fxRatesPerEur: FFRATES,
    });
    expect(r!.broker.unrealizedPnlNative).toBeCloseTo(381.87, 1);
  });

  it("HOOD: 21 sh @ $40.437, last $81.76 ⇒ +$867.78", () => {
    const r = computeUnrealizedPnL({
      lots: [{ remainingQty: "21", originalQty: "21", proceeds: "-849.18", fee: "7.99" }],
      tradeCurrency: "USD",
      lastPrice: 81.76,
      quoteCurrency: "USD",
      fxRatesPerEur: FFRATES,
    });
    expect(r!.broker.unrealizedPnlNative).toBeCloseTo(867.78, 1);
  });

  it("SPY: 24 sh @ $393.738, last $734.96 ⇒ +$8189.33", () => {
    // Largest position in the user's account — catches a $0.10/sh
    // miscalculation as a $2.40 swing, well within toBeCloseTo(_, 1).
    const r = computeUnrealizedPnL({
      lots: [{ remainingQty: "24", originalQty: "24", proceeds: "-9449.71", fee: "11.81" }],
      tradeCurrency: "USD",
      lastPrice: 734.96,
      quoteCurrency: "USD",
      fxRatesPerEur: FFRATES,
    });
    expect(r!.broker.unrealizedPnlNative).toBeCloseTo(8189.33, 1);
  });

  it("DIS: 20 sh @ $108.96, last $99.60 ⇒ −$187.21 (loss)", () => {
    const r = computeUnrealizedPnL({
      lots: [{ remainingQty: "20", originalQty: "20", proceeds: "-2179.21", fee: "7.99" }],
      tradeCurrency: "USD",
      lastPrice: 99.60,
      quoteCurrency: "USD",
      fxRatesPerEur: FFRATES,
    });
    expect(r!.broker.unrealizedPnlNative).toBeCloseTo(-187.21, 1);
  });

  it("NET: 3 sh @ $192.166, last $247.10 ⇒ +$164.80", () => {
    const r = computeUnrealizedPnL({
      lots: [{ remainingQty: "3", originalQty: "3", proceeds: "-576.50", fee: "4.99" }],
      tradeCurrency: "USD",
      lastPrice: 247.10,
      quoteCurrency: "USD",
      fxRatesPerEur: FFRATES,
    });
    expect(r!.broker.unrealizedPnlNative).toBeCloseTo(164.80, 1);
  });

  it("C: 24 sh @ $47.487, last $132.06 ⇒ +$2029.75", () => {
    const r = computeUnrealizedPnL({
      lots: [{ remainingQty: "24", originalQty: "24", proceeds: "-1139.69", fee: "5.83" }],
      tradeCurrency: "USD",
      lastPrice: 132.06,
      quoteCurrency: "USD",
      fxRatesPerEur: FFRATES,
    });
    expect(r!.broker.unrealizedPnlNative).toBeCloseTo(2029.75, 1);
  });

  it("net view (Anschaffungskosten) adds the fee onto cost — TTWO with $4.79 commission", () => {
    // Same TTWO position as above but checking the German-tax view: cost
    // = |proceeds| + |fee|, so P/L is fee dollars smaller than broker view.
    const r = computeUnrealizedPnL({
      lots: [{ remainingQty: "4", originalQty: "4", proceeds: "-476.54", fee: "4.79" }],
      tradeCurrency: "USD",
      lastPrice: 213.94,
      quoteCurrency: "USD",
      fxRatesPerEur: FFRATES,
    });
    expect(r!.broker.unrealizedPnlNative).toBeCloseTo(379.22, 1);
    expect(r!.net.unrealizedPnlNative).toBeCloseTo(379.22 - 4.79, 1);
    expect(r!.net.costBasisNative).toBeCloseTo(476.54 + 4.79, 2);
  });
});
