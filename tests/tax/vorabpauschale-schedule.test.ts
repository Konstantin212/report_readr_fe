/**
 * ELSTER Anlage KAP-INV Vorabpauschale worksheet (lines 30–45).
 *
 * Golden fixture = the SPY entry actually filed for 2025 (2024 holding year),
 * reconstructed in the filing handoff. It pins the two mistakes that cost real
 * time during that filing:
 *   - line 36 must REPEAT the opening price (430.15), not the delta
 *     (564.14 − 430.15 = 133.99). ELSTER computes the Mehrbetrag itself.
 *   - line 42 must be BLANK (null) for a holding owned before the year — an
 *     explicit 0 triggers the "not a valid twelfth" validation error.
 */
import { describe, it, expect } from "vitest";
import { buildVorabpauschaleSchedule } from "@/lib/tax/vorabpauschale-schedule";

const SPY = {
  isin: "US78462F1030",
  fundName: "SPDR S&P 500 ETF Trust (SPY)",
  fundType: "aktien" as const,
  firstPriceEur: 430.15,
  lastPriceEur: 564.14,
  distributionsPerUnitEur: 6.48,
  basiszinsPct: 2.29, // 2024 BMF rate → ×0.7 = 1.603 %
  units: 24,
  holdingYear: 2024,
};

describe("buildVorabpauschaleSchedule — SPY 2024 (filed golden)", () => {
  const r = buildVorabpauschaleSchedule(SPY);

  it("repeats the OPENING price on line 36 (not the price difference)", () => {
    expect(r.line33_firstPrice).toBe("430.15");
    expect(r.line36_firstPrice).toBe("430.15");
    expect(r.line36_firstPrice).not.toBe("133.99");
  });

  it("computes the base amount per unit at 70% of the Basiszins (4 dp)", () => {
    expect(r.line34_basisAmount).toBe("6.8953"); // 430.15 × 1.603 %
  });

  it("computes the excess amount as last − first + distributions", () => {
    expect(r.line38_excess).toBe("140.47"); // 564.14 − 430.15 + 6.48
  });

  it("takes the lower of lines 34 and 38, then subtracts distributions", () => {
    expect(r.line39_lower).toBe("6.8953");
    expect(r.line41_difference).toBe("0.4153"); // 6.8953 − 6.48
  });

  it("leaves line 42 BLANK for a pre-year holding (never 0)", () => {
    expect(r.line42_acquisitionReduction).toBeNull();
  });

  it("yields the per-unit and total advance lump sum", () => {
    expect(r.line43_vapPerUnit).toBe("0.4153");
    expect(r.line44_units).toBe("24");
    expect(r.line45_vapTotal).toBe("9.97"); // 0.4153 × 24 = 9.9672
  });

  it("carries the identity fields", () => {
    expect(r.line30_isin).toBe("US78462F1030");
    expect(r.line32_fundType).toBe("aktien");
    expect(r.deemedReceiptYear).toBe(2025); // §18 Abs. 3 — first working day of the next year
  });
});

describe("buildVorabpauschaleSchedule — intra-year acquisition", () => {
  it("reduces by one twelfth per FULL month before acquisition", () => {
    // Bought in March 2024 → 2 full months precede → reduction = line41 × 2/12.
    const r = buildVorabpauschaleSchedule({ ...SPY, acquiredAt: "2024-03-10" });
    expect(r.fullMonthsBeforeAcquisition).toBe(2);
    expect(r.line42_acquisitionReduction).toBe("0.0692"); // 0.4153 × 2/12
    expect(r.line43_vapPerUnit).toBe("0.3461"); // 0.4153 − 0.0692
  });

  it("returns zero when the Basiszins is negative", () => {
    const r = buildVorabpauschaleSchedule({ ...SPY, basiszinsPct: -0.45 });
    expect(r.line45_vapTotal).toBe("0.00");
  });
});
