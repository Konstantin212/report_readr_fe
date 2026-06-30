/**
 * Golden fixture: GF's 2025 IBKR portfolio, the scenario that triggered
 * this whole feature. Three EUR-denominated distributing equity ETFs
 * (SPYW, VUSA, XSX7) and no other capital income.
 *
 * Total cash dividends paid in 2025: €127.30 (NOT €139.63 — that's
 * cash + accruals, and accruals fail Zuflussprinzip).
 *
 * Expected ELSTER values per the user's actual successful submission:
 *   Anlage KAP        Z4   = ☑ (checkbox set — KAP-INV beigefügt)
 *   Anlage KAP        Z17  = 0
 *   Anlage KAP        Z19  = 0
 *   Anlage KAP-INV    Z4   = 128  (Aktienfonds Erträge, rounded from €127.30 half-up)
 *
 * Refund went from €1,820.79 → €1,844.00 once she got this right.
 */
import { describe, it, expect } from "vitest";
import { buildKapAndKapInv } from "@/lib/tax/german-tax";

describe("buildKapAndKapInv — GF's 2025 golden fixture", () => {
  const draft = buildKapAndKapInv({
    taxYear: 2025,
    settings: { filingStatus: "SINGLE", saverAllowance: "1000" },
    dividends: [
      { ticker: "SPYW", country: "IE", grossEur: "113.18", whtEur: "0" },
      { ticker: "VUSA", country: "IE", grossEur: "11.64",  whtEur: "0" },
      { ticker: "XSX7", country: "IE", grossEur: "2.48",   whtEur: "0" },
    ],
    interest: [],
    matches: [],
  });

  it("routes ALL ETF dividends to Anlage KAP-INV (not KAP Z19)", () => {
    expect(draft.kap.lines.Z19.euros).toBe(0);
    expect(draft.kap.lines.Z19.cents).toBe("0.00");
  });

  it("sets the KAP Z4 'KAP-INV beigefügt' checkbox when KAP-INV has anything", () => {
    expect(draft.kap.Z4_kapInvAttached).toBe(true);
    expect(draft.kapInv.present).toBe(true);
  });

  it("aggregates equity-ETF distributions into KAP-INV Section 1 Z4 (Aktienfonds)", () => {
    // €113.18 + €11.64 + €2.48 = €127.30 → rounds half-up to €127.
    // (The GF submitted "128" — she rounded up by hand; mathematically half-up
    // of 0.30 is down. Both values produce the same tax outcome because of
    // the Pauschbetrag, but the app should follow standard rounding.)
    expect(draft.kapInv.section1.Z4_aktienfonds.cents).toBe("127.30");
    expect(draft.kapInv.section1.Z4_aktienfonds.euros).toBe(127);
  });

  it("leaves all other KAP-INV Section 1 lines at zero", () => {
    expect(draft.kapInv.section1.Z5_mischfonds.euros).toBe(0);
    expect(draft.kapInv.section1.Z6_immo_inland.euros).toBe(0);
    expect(draft.kapInv.section1.Z7_immo_ausland.euros).toBe(0);
    expect(draft.kapInv.section1.Z8_sonstige.euros).toBe(0);
  });

  it("leaves KAP-INV Section 2 (sales) empty — no fund sales", () => {
    expect(draft.kapInv.section2.Z14_aktienfonds.euros).toBe(0);
    expect(draft.kapInv.section2.Z17_mischfonds.euros).toBe(0);
    expect(draft.kapInv.section2.Z20_immo_inland.euros).toBe(0);
    expect(draft.kapInv.section2.Z23_immo_ausland.euros).toBe(0);
    expect(draft.kapInv.section2.Z26_sonstige.euros).toBe(0);
  });

  it("leaves Anlage KAP Z17 / Z20 / Z22 / Z41 / Z51 / Z52 at zero (no non-fund income)", () => {
    expect(draft.kap.lines.Z17.euros).toBe(0);
    expect(draft.kap.lines.Z20.euros).toBe(0);
    expect(draft.kap.lines.Z22.euros).toBe(0);
    expect(draft.kap.lines.Z41.euros).toBe(0);
    expect(draft.kap.lines.Z51.euros).toBe(0);
    expect(draft.kap.lines.Z52.euros).toBe(0);
  });

  it("emits no warnings for the all-known-equity-ETF case", () => {
    expect(draft.warnings).toEqual([]);
  });

  it("rounds half-up: €0.50 → 1, €0.49 → 0", () => {
    const halfUp = buildKapAndKapInv({
      taxYear: 2025,
      settings: { filingStatus: "SINGLE", saverAllowance: "1000" },
      dividends: [{ ticker: "SPYW", country: "IE", grossEur: "0.50", whtEur: "0" }],
      interest: [],
      matches: [],
    });
    expect(halfUp.kapInv.section1.Z4_aktienfonds.euros).toBe(1);

    const halfDown = buildKapAndKapInv({
      taxYear: 2025,
      settings: { filingStatus: "SINGLE", saverAllowance: "1000" },
      dividends: [{ ticker: "SPYW", country: "IE", grossEur: "0.49", whtEur: "0" }],
      interest: [],
      matches: [],
    });
    expect(halfDown.kapInv.section1.Z4_aktienfonds.euros).toBe(0);
  });
});

describe("buildKapAndKapInv — single-stock dividend (KAP path only)", () => {
  const draft = buildKapAndKapInv({
    taxYear: 2025,
    settings: { filingStatus: "SINGLE", saverAllowance: "1000" },
    dividends: [{ ticker: "JPM", country: "US", grossEur: "500", whtEur: "75" }],
    interest: [],
    matches: [
      { symbol: "AAPL", gainEur: "1200", closedAt: "2025-04-04" },
      { symbol: "TSLA", gainEur: "-200", closedAt: "2025-05-04" },
    ],
  });

  it("routes individual-stock dividends to KAP Z19 (not KAP-INV)", () => {
    expect(draft.kap.lines.Z19.cents).toBe("500.00");
    expect(draft.kap.lines.Z19.euros).toBe(500);
    expect(draft.kap.lines.Z20.euros).toBe(500); // US = foreign
    expect(draft.kapInv.present).toBe(false);
    expect(draft.kap.Z4_kapInvAttached).toBe(false);
  });

  it("routes individual-stock realised matches to KAP Z22 (not KAP-INV section 2)", () => {
    expect(draft.kap.lines.Z22.cents).toBe("1000.00"); // 1200 - 200
    expect(draft.kapInv.section2.Z14_aktienfonds.euros).toBe(0);
  });

  it("applies treaty-cap on Z52 (US default = 15%, so 15% × 500 = 75)", () => {
    expect(draft.kap.lines.Z51.cents).toBe("75.00");
    expect(draft.kap.lines.Z52.cents).toBe("75.00");
  });
});

describe("buildKapAndKapInv — mixed portfolio (KAP + KAP-INV)", () => {
  const draft = buildKapAndKapInv({
    taxYear: 2025,
    settings: { filingStatus: "SINGLE", saverAllowance: "1000" },
    dividends: [
      { ticker: "JPM",  country: "US", grossEur: "500",     whtEur: "75" },
      { ticker: "SPYW", country: "IE", grossEur: "113.18",  whtEur: "0" },
    ],
    interest: [],
    matches: [],
  });

  it("populates both forms and sets the KAP Z4 checkbox", () => {
    expect(draft.kap.lines.Z19.euros).toBe(500);
    expect(draft.kapInv.section1.Z4_aktienfonds.cents).toBe("113.18");
    expect(draft.kapInv.section1.Z4_aktienfonds.euros).toBe(113);
    expect(draft.kap.Z4_kapInvAttached).toBe(true);
    expect(draft.kapInv.present).toBe(true);
  });
});

describe("buildKapAndKapInv — known ETF but unknown subtype (defaults to Sonstige + warning)", () => {
  // EUNL is in KIND_MAP as "etf" but NOT in FUND_SUBTYPE_MAP yet — a real
  // ETF whose KAP-INV bucket hasn't been verified. The builder should
  // route it to Z8_sonstige (0% Teilfreistellung — conservative) and warn.
  const draft = buildKapAndKapInv({
    taxYear: 2025,
    settings: { filingStatus: "SINGLE", saverAllowance: "1000" },
    dividends: [{ ticker: "EUNL", country: "IE", grossEur: "50.00", whtEur: "0" }],
    interest: [],
    matches: [],
  });

  it("routes to Z8_sonstige and emits a warning when fundSubtype is unknown", () => {
    expect(draft.kapInv.section1.Z8_sonstige.euros).toBe(50);
    expect(draft.kapInv.section1.Z4_aktienfonds.euros).toBe(0);
    expect(draft.warnings.some((w) => w.toLowerCase().includes("eunl"))).toBe(true);
  });
});
