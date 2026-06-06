import { describe, it, expect } from "vitest";
import { parseYahooChart } from "@/lib/quotes/yahoo";

// Sample shapes mirror what query2.finance.yahoo.com/v8/finance/chart returns.
const sample = (overrides: Partial<{
  timestamps: number[]; closes: (number | null)[]; currency: string;
}> = {}) => {
  const ts = overrides.timestamps ?? [
    Date.UTC(2026, 5, 2) / 1000, // 2026-06-02
    Date.UTC(2026, 5, 3) / 1000, // 2026-06-03
    Date.UTC(2026, 5, 4) / 1000, // 2026-06-04
    Date.UTC(2026, 5, 5) / 1000, // 2026-06-05
  ];
  const closes = overrides.closes ?? [90.73, 88.16, 88.33, 82.47];
  return {
    chart: {
      result: [{
        meta: { currency: overrides.currency ?? "USD" },
        timestamp: ts,
        indicators: { quote: [{ close: closes }] },
      }],
      error: null,
    },
  };
};

describe("parseYahooChart", () => {
  it("returns the latest non-null close + its date + currency", () => {
    const out = parseYahooChart(sample(), "HOOD");
    expect(out).toEqual({ symbol: "HOOD", date: "2026-06-05", close: "82.47", currency: "USD" });
  });

  it("falls back to an earlier close when the latest entry is null", () => {
    // Yahoo sometimes pads the array with nulls when a session hasn't reported yet.
    const out = parseYahooChart(
      sample({ closes: [90.73, 88.16, 88.33, null] }),
      "HOOD",
    );
    expect(out).toEqual({ symbol: "HOOD", date: "2026-06-04", close: "88.33", currency: "USD" });
  });

  it("returns null when every close is null", () => {
    const out = parseYahooChart(sample({ closes: [null, null, null, null] }), "HOOD");
    expect(out).toBeNull();
  });

  it("returns null when result is missing (unauthorized response)", () => {
    expect(parseYahooChart({ chart: { result: null, error: { code: "Unauthorized" } } }, "HOOD")).toBeNull();
    expect(parseYahooChart({}, "HOOD")).toBeNull();
  });

  it("preserves the non-USD currency (LSE, Xetra, etc.)", () => {
    const out = parseYahooChart(sample({ currency: "GBP" }), "VHYL");
    expect(out?.currency).toBe("GBP");
  });

  it("treats GBp (London pence) as GBP scaled by 1/100", () => {
    // LSE ordinary-share quotes come back in pence with currency "GBp"; our
    // pipeline standardizes on GBP units so positions math stays consistent.
    const out = parseYahooChart(
      sample({ currency: "GBp", closes: [255, 256, 257, 254] }),
      "TRN",
    );
    expect(out).toEqual({ symbol: "TRN", date: "2026-06-05", close: "2.54", currency: "GBP" });
  });
});
