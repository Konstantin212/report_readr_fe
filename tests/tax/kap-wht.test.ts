/**
 * T4 — foreign withholding tax aggregation.
 *
 * Brokers that report WHT in a dedicated section (IBKR's "Withholding Tax")
 * emit standalone WITHHOLDING_TAX events, so the withheld amount never reaches
 * the dividend row's `whtEur`. Those must be matched back to the paying stock
 * (per-dividend treaty cap on Zeile 41) WITHOUT double-counting brokers (FF)
 * that already stamp WHT inline. ETF/fund WHT is never creditable (InvStG 2018).
 */
import { describe, it, expect } from "vitest";
import { buildKapAndKapInv } from "@/lib/tax/german-tax";
import { buildInputs, dividend, ACCT } from "./kap-fixtures";

describe("buildKapAndKapInv — withholding tax (T4)", () => {
  it("routes a standalone WITHHOLDING_TAX event to foreignWhtGross/Zeile 41, matched to its dividend", () => {
    const draft = buildKapAndKapInv({
      taxYear: 2025,
      settings: { filingStatus: "SINGLE", saverAllowance: "1000" },
      // TSM dividend with NO inline WHT (IBKR reported it separately)
      dividends: [{ ticker: "TSM", country: "US", grossEur: "20.00", whtEur: "0" }],
      interest: [],
      matches: [],
      withholding: [{ symbol: "TSM", whtEur: "1.00", country: "US" }],
    });
    expect(draft.kap.foreignWhtGross.cents).toBe("1.00");
    // Treaty cap: min(1.00, 20 × 15%) = 1.00 (well under cap)
    expect(draft.kap.lines.Z41.cents).toBe("1.00");
  });

  it("caps Zeile 41 at the treaty rate against the dividend gross", () => {
    const draft = buildKapAndKapInv({
      taxYear: 2025,
      settings: { filingStatus: "SINGLE", saverAllowance: "1000" },
      dividends: [{ ticker: "GM", country: "US", grossEur: "4.00", whtEur: "0" }],
      interest: [],
      matches: [],
      withholding: [{ symbol: "GM", whtEur: "2.00", country: "US" }],
    });
    expect(draft.kap.foreignWhtGross.cents).toBe("2.00");       // full WHT paid
    expect(draft.kap.lines.Z41.cents).toBe("0.60");             // 15% × 4.00
  });

  it("does NOT double-count when the dividend already carries inline WHT (FF)", () => {
    const draft = buildKapAndKapInv({
      taxYear: 2025,
      settings: { filingStatus: "SINGLE", saverAllowance: "1000" },
      dividends: [{ ticker: "C", country: "US", grossEur: "50.00", whtEur: "7.50" }],
      interest: [],
      matches: [],
      // FF also emits a standalone tax row for the same dividend — must be ignored.
      withholding: [{ symbol: "C", whtEur: "7.50", country: "US" }],
    });
    expect(draft.kap.foreignWhtGross.cents).toBe("7.50");
    expect(draft.kap.lines.Z41.cents).toBe("7.50");
  });

  it("keeps ETF/fund WHT out of foreignWhtGross/Zeile 41 (warning only, InvStG 2018)", () => {
    const draft = buildKapAndKapInv({
      taxYear: 2025,
      settings: { filingStatus: "SINGLE", saverAllowance: "1000" },
      dividends: [{ ticker: "SPY", country: "US", grossEur: "100.00", whtEur: "0" }],
      interest: [],
      matches: [],
      withholding: [{ symbol: "SPY", whtEur: "3.00", country: "US" }],
      classification: { SPY: { kind: "etf", subtype: "aktien" } },
    });
    expect(draft.kap.foreignWhtGross.cents).toBe("0.00");
    expect(draft.kap.lines.Z41.cents).toBe("0.00");
    expect(draft.warnings.some((w) => w.includes("SPY") && /not investor-creditable|InvStG/i.test(w))).toBe(true);
    // The dividend itself went to KAP-INV Aktienfonds, not KAP.
    expect(draft.kapInv.section1.Z4_aktienfonds.cents).toBe("100.00");
  });

  it("matches WHT per broker: same symbol at two brokers, neither credit dropped nor double-counted", () => {
    // AAPL held at FF (inline WHT 5 + a duplicate standalone tax row) AND at
    // IBKR (dividend with no inline WHT + a legitimate standalone WHT event 3).
    // Keying by symbol alone would let FF's inline>0 suppress IBKR's standalone.
    const draft = buildKapAndKapInv({
      taxYear: 2025,
      settings: { filingStatus: "SINGLE", saverAllowance: "1000" },
      dividends: [
        { ticker: "AAPL", country: "US", grossEur: "100.00", whtEur: "5.00", broker: "FF" },
        { ticker: "AAPL", country: "US", grossEur: "60.00", whtEur: "0", broker: "IBKR" },
      ],
      interest: [],
      matches: [],
      withholding: [
        { symbol: "AAPL", whtEur: "5.00", country: "US", broker: "FF" },   // FF duplicate → must be skipped
        { symbol: "AAPL", whtEur: "3.00", country: "US", broker: "IBKR" }, // IBKR legit → must be added
      ],
    });
    // foreignWhtGross = FF inline 5 + IBKR standalone 3 = 8 (FF standalone dup ignored).
    expect(draft.kap.foreignWhtGross.cents).toBe("8.00");
    expect(draft.kap.lines.Z41.cents).toBe("8.00");
    // No "couldn't be matched" warning — IBKR's WHT matched its own dividend.
    expect(draft.warnings.some((w) => /couldn't be matched/i.test(w))).toBe(false);
  });

  it("warns when standalone WHT can't be matched to any dividend", () => {
    const draft = buildKapAndKapInv({
      taxYear: 2025,
      settings: { filingStatus: "SINGLE", saverAllowance: "1000" },
      dividends: [],
      interest: [],
      matches: [],
      withholding: [{ symbol: "ORPH", whtEur: "1.25", country: "US" }],
    });
    expect(draft.kap.foreignWhtGross.cents).toBe("1.25"); // still counted as paid
    expect(draft.kap.lines.Z41.cents).toBe("0.00");       // creditability unverified
    expect(draft.warnings.some((w) => w.includes("ORPH"))).toBe(true);
  });
});

describe("foreign withholding lands on the real form line", () => {
  it("puts creditable foreign tax in Zeile 41, section 8", () => {
    const d = buildKapAndKapInv(
      buildInputs(
        [dividend({ brokerAccountId: ACCT.ibkr, symbol: "TSM", amountEur: "100.00", whtEur: "15.00" })],
        [],
        { TSM: { kind: "stock", subtype: null } },
      ),
    );
    expect(d.kap.lines.Z41.cents).toBe("15.00");
  });

  it("keeps the gross figure OFF the form — there is no Zeile for it", () => {
    const d = buildKapAndKapInv(
      buildInputs(
        [dividend({ brokerAccountId: ACCT.ibkr, symbol: "TSM", amountEur: "100.00", whtEur: "30.00" })],
        [],
        { TSM: { kind: "stock", subtype: null } },
      ),
    );
    // 30 % withheld, treaty caps credit at 15 % of the gross.
    expect(d.kap.foreignWhtGross.cents).toBe("30.00");
    expect(d.kap.lines.Z41.cents).toBe("15.00");
    expect((d.kap.lines as Record<string, unknown>).Z51).toBeUndefined();
    expect((d.kap.lines as Record<string, unknown>).Z52).toBeUndefined();
  });
});
