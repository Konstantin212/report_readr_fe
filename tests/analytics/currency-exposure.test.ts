import { describe, expect, it } from "vitest";
import { computeCurrencyExposure } from "@/lib/analytics/currency-exposure";

describe("computeCurrencyExposure", () => {
  it("returns empty array for empty input", () => {
    expect(computeCurrencyExposure([])).toEqual([]);
  });

  it("single USD position → 100% USD", () => {
    const result = computeCurrencyExposure([{ currency: "USD", marketEur: 1000 }]);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("USD");
    expect(result[0].pct).toBe(100);
    expect(result[0].valueEur).toBe(1000);
  });

  it("mixed currencies → correct percentages and sorted desc by value", () => {
    const result = computeCurrencyExposure([
      { currency: "EUR", marketEur: 2000 },
      { currency: "USD", marketEur: 3000 },
      { currency: "GBP", marketEur: 1000 },
    ]);
    expect(result).toHaveLength(3);
    expect(result[0].code).toBe("USD");
    expect(result[0].pct).toBe(50);
    expect(result[1].code).toBe("EUR");
    expect(result[1].pct).toBe(33.3);
    expect(result[2].code).toBe("GBP");
    expect(result[2].pct).toBe(16.7);
  });

  it("skips positions with null marketEur", () => {
    const result = computeCurrencyExposure([
      { currency: "USD", marketEur: 1000 },
      { currency: "EUR", marketEur: null },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("USD");
  });

  it("attaches known flags", () => {
    const result = computeCurrencyExposure([
      { currency: "USD", marketEur: 100 },
      { currency: "EUR", marketEur: 100 },
      { currency: "GBP", marketEur: 100 },
      { currency: "HKD", marketEur: 100 },
      { currency: "CHF", marketEur: 100 },
      { currency: "JPY", marketEur: 100 },
      { currency: "XYZ", marketEur: 100 },
    ]);
    const byCode = Object.fromEntries(result.map((r) => [r.code, r.flag]));
    expect(byCode["USD"]).toBe("🇺🇸");
    expect(byCode["EUR"]).toBe("🇪🇺");
    expect(byCode["GBP"]).toBe("🇬🇧");
    expect(byCode["HKD"]).toBe("🇭🇰");
    expect(byCode["CHF"]).toBe("🇨🇭");
    expect(byCode["JPY"]).toBe("🇯🇵");
    expect(byCode["XYZ"]).toBeUndefined();
  });
});
