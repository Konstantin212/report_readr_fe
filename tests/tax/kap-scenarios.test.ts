import { describe, it, expect } from "vitest";
import { buildAnlageKap } from "@/lib/tax/german-tax";
import type { BuildAnlageKapInput } from "@/lib/tax/german-tax";

function makeInput(overrides: Partial<BuildAnlageKapInput> = {}): BuildAnlageKapInput {
  return {
    taxYear: 2024,
    settings: { filingStatus: "SINGLE", saverAllowance: "1000" },
    dividends: [],
    interest: [],
    matches: [],
    ...overrides,
  };
}

describe("buildAnlageKap — German tax scenarios", () => {
  it("empty inputs produce all zero lines", () => {
    const draft = buildAnlageKap(makeInput());
    expect(draft.lines.Z19).toBe("0.00");
    expect(draft.lines.Z20).toBe("0.00");
    expect(draft.lines.Z21).toBe("0.00");
    expect(draft.lines.Z22).toBe("0.00");
    expect(draft.lines.Z41).toBe("0.00");
    expect(draft.lines.Z51).toBe("0.00");
    expect(draft.lines.Z52).toBe("0.00");
  });

  it("single domestic German dividend: Z19 has it, Z20 stays 0", () => {
    const draft = buildAnlageKap(makeInput({
      dividends: [{ ticker: "SAP", country: "DE", grossEur: "200", whtEur: "0" }],
    }));
    expect(draft.lines.Z19).toBe("200.00");
    expect(draft.lines.Z20).toBe("0.00");
  });

  it("single US dividend ($500 gross, $75 WHT) → Z19=500, Z20=500, Z51=75, Z52=75 (at 15% cap exactly)", () => {
    const draft = buildAnlageKap(makeInput({
      dividends: [{ ticker: "AAPL", country: "US", grossEur: "500", whtEur: "75" }],
    }));
    expect(draft.lines.Z19).toBe("500.00");
    expect(draft.lines.Z20).toBe("500.00");
    expect(draft.lines.Z51).toBe("75.00");
    expect(draft.lines.Z52).toBe("75.00"); // 15% of 500 = 75, exactly at cap
  });

  it("US dividend with WHT exceeding 15% (e.g. $500 gross, $100 WHT) → Z52 capped at $75", () => {
    const draft = buildAnlageKap(makeInput({
      dividends: [{ ticker: "AAPL", country: "US", grossEur: "500", whtEur: "100" }],
    }));
    expect(draft.lines.Z51).toBe("100.00"); // actual WHT paid
    expect(draft.lines.Z52).toBe("75.00");  // capped at 15% of 500
  });

  it("US dividend with WHT below 15% (e.g. $500 gross, $50 WHT) → Z52 = $50 (full, not capped)", () => {
    const draft = buildAnlageKap(makeInput({
      dividends: [{ ticker: "AAPL", country: "US", grossEur: "500", whtEur: "50" }],
    }));
    expect(draft.lines.Z51).toBe("50.00");
    expect(draft.lines.Z52).toBe("50.00"); // below cap, so full amount
  });

  it("Country not in treaty map (e.g. JP) uses default 0.15 cap", () => {
    // JP is not in TREATY_CAP, so defaults to 0.15
    const draft = buildAnlageKap(makeInput({
      dividends: [{ ticker: "SONY", country: "JP", grossEur: "400", whtEur: "80" }],
    }));
    // cap = 0.15 * 400 = 60; wht=80 > 60, so Z52 = 60
    expect(draft.lines.Z52).toBe("60.00");
  });

  it("dividend with no country set uses default 0.15 cap", () => {
    const draft = buildAnlageKap(makeInput({
      dividends: [{ ticker: "UNKN", grossEur: "200", whtEur: "40" }],
    }));
    // cap = 0.15 * 200 = 30; wht=40 > 30, so Z52 = 30
    expect(draft.lines.Z52).toBe("30.00");
    // No country → NOT counted as foreign in Z20
    expect(draft.lines.Z20).toBe("0.00");
  });

  it("multiple dividends from different countries: foreign sum goes into Z20, domestic stays out", () => {
    const draft = buildAnlageKap(makeInput({
      dividends: [
        { ticker: "SAP", country: "DE", grossEur: "100", whtEur: "0" },
        { ticker: "AAPL", country: "US", grossEur: "200", whtEur: "30" },
        { ticker: "ASML", country: "NL", grossEur: "150", whtEur: "22.50" },
      ],
    }));
    expect(draft.lines.Z19).toBe("450.00"); // 100 + 200 + 150
    expect(draft.lines.Z20).toBe("350.00"); // 200 + 150 (DE excluded)
  });

  it("interest income raises Z19 but not Z20", () => {
    const draft = buildAnlageKap(makeInput({
      interest: [{ grossEur: "300" }],
    }));
    expect(draft.lines.Z19).toBe("300.00");
    expect(draft.lines.Z20).toBe("0.00");
  });

  it("matches with positive gains only → Z22 = sum of gains, positive", () => {
    const draft = buildAnlageKap(makeInput({
      matches: [
        { symbol: "AAPL", gainEur: "500", closedAt: "2024-05-01" },
        { symbol: "MSFT", gainEur: "300", closedAt: "2024-06-01" },
      ],
    }));
    expect(draft.lines.Z22).toBe("800.00");
  });

  it("matches with losses only → Z22 = sum of gains, negative", () => {
    const draft = buildAnlageKap(makeInput({
      matches: [
        { symbol: "AAPL", gainEur: "-200", closedAt: "2024-05-01" },
        { symbol: "TSLA", gainEur: "-100", closedAt: "2024-06-01" },
      ],
    }));
    expect(draft.lines.Z22).toBe("-300.00");
  });

  it("mix of gains and losses → Z22 = net (could be negative)", () => {
    const draft = buildAnlageKap(makeInput({
      matches: [
        { symbol: "AAPL", gainEur: "500", closedAt: "2024-05-01" },
        { symbol: "TSLA", gainEur: "-700", closedAt: "2024-06-01" },
      ],
    }));
    expect(draft.lines.Z22).toBe("-200.00");
  });

  it("all lines are formatted with exactly 2 decimal places (string ends with .XX)", () => {
    const draft = buildAnlageKap(makeInput({
      dividends: [{ ticker: "X", country: "US", grossEur: "333.33", whtEur: "49.99" }],
      interest: [{ grossEur: "111.11" }],
      matches: [{ symbol: "Y", gainEur: "222.22", closedAt: "2024-01-01" }],
    }));
    for (const [key, val] of Object.entries(draft.lines)) {
      expect(val, `${key} should have 2 decimal places`).toMatch(/^-?\d+\.\d{2}$/);
    }
  });

  it("evidence list contains one item per dividend AND one per match", () => {
    const draft = buildAnlageKap(makeInput({
      dividends: [
        { ticker: "AAPL", country: "US", grossEur: "100", whtEur: "15" },
        { ticker: "SAP", country: "DE", grossEur: "50", whtEur: "0" },
      ],
      matches: [
        { symbol: "NVDA", gainEur: "200", closedAt: "2024-03-01" },
      ],
    }));
    expect(draft.evidence).toHaveLength(3); // 2 dividends + 1 match
  });

  it("evidence fingerprints are unique strings", () => {
    const draft = buildAnlageKap(makeInput({
      dividends: [
        { ticker: "AAPL", country: "US", grossEur: "100", whtEur: "15" },
        { ticker: "SAP", country: "DE", grossEur: "50", whtEur: "0" },
      ],
      matches: [
        { symbol: "NVDA", gainEur: "200", closedAt: "2024-03-01" },
        { symbol: "TSLA", gainEur: "-50", closedAt: "2024-04-01" },
      ],
    }));
    const fingerprints = draft.evidence.map(e => e.fingerprint);
    const unique = new Set(fingerprints);
    expect(unique.size).toBe(fingerprints.length);
    for (const fp of fingerprints) {
      expect(typeof fp).toBe("string");
      expect(fp.length).toBeGreaterThan(0);
    }
  });

  it("Z21 is always 0.00", () => {
    const draft = buildAnlageKap(makeInput({
      dividends: [{ ticker: "AAPL", country: "US", grossEur: "1000", whtEur: "150" }],
      matches: [{ symbol: "X", gainEur: "5000", closedAt: "2024-01-01" }],
    }));
    expect(draft.lines.Z21).toBe("0.00");
  });

  it("Z41 is always 0.00 (foreign brokers don't withhold Abgeltungsteuer)", () => {
    const draft = buildAnlageKap(makeInput({
      matches: [{ symbol: "MSFT", gainEur: "10000", closedAt: "2024-06-01" }],
    }));
    expect(draft.lines.Z41).toBe("0.00");
  });
});
