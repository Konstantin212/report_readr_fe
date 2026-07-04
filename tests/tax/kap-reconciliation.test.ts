/**
 * T5 — per-broker × per-formTarget reconciliation.
 *
 * A synthetic mixed portfolio (FF US-ETFs + FF stock loss, IBKR EU-ETFs +
 * IBKR stock loss, a COINBASE crypto gain) is routed end-to-end through the
 * real tax.ts account-scope + classification threading, then reconciled. This
 * is the guard that would have caught the −3,269 crypto leak: crypto stays out
 * of every KAP line, and the subtotals are visible per broker.
 */
import { describe, it, expect } from "vitest";
import { buildKapAndKapInv } from "@/lib/tax/german-tax";
import { buildReconciliation } from "@/lib/tax/kap-inputs";
import { buildInputs, accounts, dividend, match, ACCT } from "./kap-fixtures";

describe("KAP reconciliation subtotals (T5)", () => {
  // US ETFs justETF can't classify — enrichment supplies kind:"etf", subtype
  // falls through to FUND_SUBTYPE_MAP → aktien (T1).
  const classification = {
    SPY: { kind: "etf" as const, subtype: null },
    SCHD: { kind: "etf" as const, subtype: null },
    VOO: { kind: "etf" as const, subtype: null },
  };

  const tx = [
    // FF US-ETF distributions (251.65 total)
    dividend({ brokerAccountId: ACCT.ff, symbol: "SPY", isin: "US78462F1030", amountEur: "156.42" }),
    dividend({ brokerAccountId: ACCT.ff, symbol: "SCHD", isin: "US8085247976", amountEur: "70.64" }),
    dividend({ brokerAccountId: ACCT.ff, symbol: "VOO", isin: "US9229083632", amountEur: "24.59" }),
    // IBKR EU-ETF distributions (182 total) — already in the hardcoded maps
    dividend({ brokerAccountId: ACCT.ibkr, symbol: "SPYW", isin: "IE00B3RBWM25", amountEur: "100.00" }),
    dividend({ brokerAccountId: ACCT.ibkr, symbol: "VHYL", isin: "IE00B8GKDB10", amountEur: "50.00" }),
    dividend({ brokerAccountId: ACCT.ibkr, symbol: "VUSA", isin: "IE00B3XXRP09", amountEur: "32.00" }),
  ];
  const matches = [
    // FF SCHD ETF sale gain → KAP-INV S2 Z14
    match({ brokerAccountId: ACCT.ff, symbol: "SCHD", gainEur: "215.39" }),
    // FF single-stock loss → KAP Z23
    match({ brokerAccountId: ACCT.ff, symbol: "GM", gainEur: "-780.87" }),
    // IBKR single-stock loss → KAP Z23
    match({ brokerAccountId: ACCT.ibkr, symbol: "ENPH", gainEur: "-411.76" }),
    // COINBASE crypto gain — MUST be excluded from every KAP line
    match({ brokerAccountId: ACCT.coinbase, symbol: "BTC", gainEur: "5000.00" }),
  ];

  const draft = buildKapAndKapInv(buildInputs(tx, matches, classification));
  const recon = buildReconciliation(draft, accounts());

  function total(broker: string, formTarget: string): number {
    return recon.rows
      .filter((r) => r.broker === broker && r.formTarget === formTarget)
      .reduce((s, r) => s + r.totalEur, 0);
  }

  it("aggregates both brokers' ETF distributions into KAP-INV S1 Z4 ≈ 434", () => {
    expect(draft.kapInv.section1.Z4_aktienfonds.euros).toBe(434); // 251.65 + 182 = 433.65
    expect(total("FF", "KAP_INV_S1_Z4")).toBeCloseTo(251.65, 2);
    expect(total("IBKR", "KAP_INV_S1_Z4")).toBeCloseTo(182, 2);
  });

  it("routes the SCHD ETF sale gain to KAP-INV S2 Z14 ≈ 215", () => {
    expect(draft.kapInv.section2.Z14_aktienfonds.euros).toBe(215);
    expect(total("FF", "KAP_INV_S2_Z14")).toBeCloseTo(215.39, 2);
  });

  it("splits both brokers' single-stock losses into KAP Z23 (non-negative)", () => {
    expect(draft.kap.lines.Z23.cents).toBe("1192.63"); // 780.87 + 411.76
    expect(total("FF", "KAP_Z23")).toBeCloseTo(-780.87, 2);
    expect(total("IBKR", "KAP_Z23")).toBeCloseTo(-411.76, 2);
  });

  it("keeps crypto out of every KAP line and notes it as a real exclusion", () => {
    const symbols = draft.evidence.map((e) => e.symbol ?? e.ticker);
    expect(symbols).not.toContain("BTC");
    // Crypto IS structurally filtered → belongs in `excluded`.
    expect(recon.excluded.some((x) => /crypto/i.test(x))).toBe(true);
    // Equity swaps are NOT filtered (importer doesn't distinguish them yet) →
    // they must appear as an honest caveat, never as a claimed exclusion.
    expect(recon.excluded.some((x) => /swap/i.test(x))).toBe(false);
    expect(recon.caveats.some((x) => /swap/i.test(x))).toBe(true);
  });

  it("produces no negative ELSTER value anywhere", () => {
    for (const v of Object.values(draft.kap.lines)) {
      expect(Number(v.cents)).toBeGreaterThanOrEqual(0);
    }
  });
});
