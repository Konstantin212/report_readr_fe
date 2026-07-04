/**
 * T3 — stock-sale gains and losses land in separate NON-NEGATIVE Zeilen.
 *
 * Anlage KAP 2025 separates §20 Abs.2 Nr.1 share-sale gains (Z20) from losses
 * (Z23, own §20 Abs.6 bucket) and non-share losses (Z22). Entering a negative
 * number into a gains field is rejected by ELSTER, so every emitted value is a
 * non-negative magnitude. Line numbers verified against the official 2025
 * Formular / privatsparer.de + steuern.de (Zeile 21 removed for 2025).
 */
import { describe, it, expect } from "vitest";
import { buildKapAndKapInv, type GermanTaxDraft } from "@/lib/tax/german-tax";

function allNonNegative(draft: GermanTaxDraft) {
  const zeilen = [
    ...Object.values(draft.kap.lines),
    ...Object.values(draft.kapInv.section1),
    ...Object.values(draft.kapInv.section2),
  ];
  for (const z of zeilen) {
    expect(Number(z.cents), `cents ${z.cents}`).toBeGreaterThanOrEqual(0);
    expect(z.euros, `euros ${z.euros}`).toBeGreaterThanOrEqual(0);
  }
}

describe("buildKapAndKapInv — stock gain/loss split (T3)", () => {
  it("routes stock gains to Z20 and stock losses to Z23, both positive", () => {
    const draft = buildKapAndKapInv({
      taxYear: 2025,
      settings: { filingStatus: "SINGLE", saverAllowance: "1000" },
      dividends: [],
      interest: [],
      matches: [
        { symbol: "AAPL", gainEur: "1200.50", closedAt: "2025-04-04" },
        { symbol: "TSLA", gainEur: "-780.87", closedAt: "2025-05-04" },
        { symbol: "NVDA", gainEur: "300.00", closedAt: "2025-06-04" },
      ],
    });
    expect(draft.kap.lines.Z20.cents).toBe("1500.50"); // 1200.50 + 300
    expect(draft.kap.lines.Z23.cents).toBe("780.87");  // |−780.87|
    expect(draft.kap.lines.Z22.cents).toBe("0.00");
    allNonNegative(draft);
  });

  it("routes non-Aktien (bond/other) losses to Z22, not Z23", () => {
    const draft = buildKapAndKapInv({
      taxYear: 2025,
      settings: { filingStatus: "SINGLE", saverAllowance: "1000" },
      dividends: [],
      interest: [],
      matches: [
        // Treasury bond loss — classified "bond" by classifyKind
        { symbol: "T 4 5/8 09/15/26", gainEur: "-14.14", closedAt: "2025-03-01" },
        { symbol: "AAPL", gainEur: "-50.00", closedAt: "2025-03-02" },
      ],
    });
    expect(draft.kap.lines.Z22.cents).toBe("14.14"); // bond loss
    expect(draft.kap.lines.Z23.cents).toBe("50.00"); // stock loss
    allNonNegative(draft);
  });

  it("a net-loss stock year never produces a negative line", () => {
    const draft = buildKapAndKapInv({
      taxYear: 2025,
      settings: { filingStatus: "SINGLE", saverAllowance: "1000" },
      dividends: [{ ticker: "AAPL", country: "US", grossEur: "100", whtEur: "0" }],
      interest: [],
      matches: [{ symbol: "ENPH", gainEur: "-411.76", closedAt: "2025-09-01" }],
    });
    expect(draft.kap.lines.Z23.cents).toBe("411.76");
    expect(draft.kap.lines.Z20.cents).toBe("0.00");
    // Z19 is a positive total (the 100 dividend), never dragged negative by the loss.
    expect(draft.kap.lines.Z19.cents).toBe("100.00");
    allNonNegative(draft);
  });

  it("GF fixture still reproduces her filed values under the new shape", () => {
    // The 2025 IBKR portfolio she successfully submitted: three EUR equity ETFs,
    // all-zero KAP, KAP-INV Section 1 Z4 = 127.
    const draft = buildKapAndKapInv({
      taxYear: 2025,
      settings: { filingStatus: "SINGLE", saverAllowance: "1000" },
      dividends: [
        { ticker: "SPYW", country: "IE", grossEur: "113.18", whtEur: "0" },
        { ticker: "VUSA", country: "IE", grossEur: "11.64", whtEur: "0" },
        { ticker: "XSX7", country: "IE", grossEur: "2.48", whtEur: "0" },
      ],
      interest: [],
      matches: [],
    });
    expect(draft.kapInv.section1.Z4_aktienfonds.euros).toBe(127);
    expect(draft.kap.lines.Z19.euros).toBe(0);
    expect(draft.kap.lines.Z20.euros).toBe(0);
    expect(draft.kap.lines.Z22.euros).toBe(0);
    expect(draft.kap.lines.Z23.euros).toBe(0);
    expect(draft.warnings).toEqual([]);
    allNonNegative(draft);
  });
});
