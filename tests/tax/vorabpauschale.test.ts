import { describe, it, expect } from "vitest";
import {
  BASISZINS_PCT,
  basiszinsFor,
  computeVorabpauschale,
  acquisitionMonthsFactor,
} from "@/lib/tax/vorabpauschale";

describe("computeVorabpauschale (§18 InvStG arithmetic)", () => {
  it("BMF-style base case: Basisertrag below value gain, no distributions", () => {
    // 10,000 € on Jan 1, Basiszins 2.29 % (2024):
    // Basisertrag = 10000 × 0.0229 × 0.7 = 160.30 — fund gained more.
    const vap = computeVorabpauschale({
      startValueEur: "10000",
      endValueEur: "11000",
      distributionsEur: "0",
      basiszinsPct: 2.29,
    });
    expect(vap).toBe("160.30");
  });

  it("caps at the actual value gain when the fund barely grew", () => {
    const vap = computeVorabpauschale({
      startValueEur: "10000",
      endValueEur: "10050", // only +50 — less than the 160.30 Basisertrag
      distributionsEur: "0",
      basiszinsPct: 2.29,
    });
    expect(vap).toBe("50.00");
  });

  it("is zero when the fund lost value", () => {
    const vap = computeVorabpauschale({
      startValueEur: "10000",
      endValueEur: "9000",
      distributionsEur: "0",
      basiszinsPct: 2.29,
    });
    expect(vap).toBe("0.00");
  });

  it("is zero for zero/negative Basiszins years (2021/2022)", () => {
    for (const year of [2021, 2022]) {
      const vap = computeVorabpauschale({
        startValueEur: "10000",
        endValueEur: "12000",
        distributionsEur: "0",
        basiszinsPct: BASISZINS_PCT[year],
      });
      expect(vap).toBe("0.00");
    }
  });

  it("distributions reduce the Basisertrag (Dist fund with partial VAP)", () => {
    // Basisertrag 160.30, distributions 100 → VAP 60.30 (gain permitting).
    const vap = computeVorabpauschale({
      startValueEur: "10000",
      endValueEur: "11000",
      distributionsEur: "100",
      basiszinsPct: 2.29,
    });
    expect(vap).toBe("60.30");
  });

  it("distributions above the Basisertrag → zero (typical Dist fund)", () => {
    const vap = computeVorabpauschale({
      startValueEur: "10000",
      endValueEur: "11000",
      distributionsEur: "300",
      basiszinsPct: 2.29,
    });
    expect(vap).toBe("0.00");
  });

  it("applies the 12ths pro-rating for mid-year purchases", () => {
    // Bought in March → 10/12 of the Basisertrag: 160.30 × 10/12 = 133.58.
    const vap = computeVorabpauschale({
      startValueEur: "10000",
      endValueEur: "11000",
      distributionsEur: "0",
      basiszinsPct: 2.29,
      monthsFactor: acquisitionMonthsFactor("2024-03-15", 2024),
    });
    expect(vap).toBe("133.58");
  });
});

describe("acquisitionMonthsFactor (§18 Abs. 2 InvStG)", () => {
  it("full year for positions held since before the holding year", () => {
    expect(acquisitionMonthsFactor("2020-06-01", 2024)).toBe(1);
  });
  it("January purchase → 12/12", () => {
    expect(acquisitionMonthsFactor("2024-01-20", 2024)).toBe(1);
  });
  it("March purchase → 10/12", () => {
    expect(acquisitionMonthsFactor("2024-03-15", 2024)).toBeCloseTo(10 / 12, 10);
  });
  it("December purchase → 1/12", () => {
    expect(acquisitionMonthsFactor("2024-12-01", 2024)).toBeCloseTo(1 / 12, 10);
  });
  it("purchase after the holding year → 0", () => {
    expect(acquisitionMonthsFactor("2025-02-01", 2024)).toBe(0);
  });
});

describe("basiszinsFor", () => {
  it("returns published rates and null for unknown years", () => {
    expect(basiszinsFor(2024)).toBe(2.29);
    expect(basiszinsFor(2030)).toBeNull();
  });
});
