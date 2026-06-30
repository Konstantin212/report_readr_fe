/**
 * Manual-verification snapshot for the GF's 2025 portfolio.
 *
 * Runs `buildKapAndKapInv` end-to-end on the exact dividend amounts
 * from her IBKR statement (D:/cot/U18558321_2025_2025.csv lines 178-185)
 * and prints the resulting draft so we can eyeball it against the
 * values she successfully submitted via ELSTER.
 *
 * Expected: KAP-INV Section 1 Z4 = 127 (Aktienfonds), everything else 0,
 * Z4 checkbox set, no warnings.
 */
import { describe, it, expect } from "vitest";
import { buildKapAndKapInv } from "@/lib/tax/german-tax";

describe("End-to-end GF 2025 fixture", () => {
  it("matches her actual ELSTER submission shape", () => {
    const draft = buildKapAndKapInv({
      taxYear: 2025,
      settings: { filingStatus: "SINGLE", saverAllowance: "1000" },
      dividends: [
        // Lines 178, 181, 182 of the IBKR statement, normalised to EUR
        // (USD legs converted at IBKR's ECB rate per the Cash Report).
        { ticker: "SPYW", country: "IE", grossEur: "113.18", whtEur: "0" },
        { ticker: "VUSA", country: "IE", grossEur: "2.31",   whtEur: "0" },  // 2.69 USD → 2.31 EUR
        { ticker: "VUSA", country: "IE", grossEur: "9.33",   whtEur: "0" },  // 10.97 USD → 9.33 EUR
        { ticker: "XSX7", country: "IE", grossEur: "2.48",   whtEur: "0" },
      ],
      interest: [],
      matches: [],
    });

    // KAP page — everything zero, checkbox set
    expect(draft.kap.Z4_kapInvAttached).toBe(true);
    expect(draft.kap.lines.Z17.euros).toBe(0);
    expect(draft.kap.lines.Z19.euros).toBe(0);
    expect(draft.kap.lines.Z22.euros).toBe(0);

    // KAP-INV Section 1 Z4 — the only non-zero line
    expect(draft.kapInv.present).toBe(true);
    // Sum: 113.18 + 2.31 + 9.33 + 2.48 = 127.30 → 127 (half-up)
    expect(draft.kapInv.section1.Z4_aktienfonds.cents).toBe("127.30");
    expect(draft.kapInv.section1.Z4_aktienfonds.euros).toBe(127);
    expect(draft.kapInv.section1.Z5_mischfonds.euros).toBe(0);
    expect(draft.kapInv.section1.Z8_sonstige.euros).toBe(0);

    // No warnings — all symbols known equity ETFs
    expect(draft.warnings).toEqual([]);

    // Evidence rows: 4 dividend entries, all routed to KAP-INV S1 Z4
    expect(draft.evidence).toHaveLength(4);
    expect(draft.evidence.every((e) => e.formTarget === "KAP_INV_S1_Z4")).toBe(true);
  });
});
