/**
 * T2a — Anlage KAP account scope.
 *
 * Anlage KAP is §20 EStG. Crypto realised gains/losses (§23) and staking
 * (§22 Nr.3) belong on Anlage SO, so COINBASE-account rows must never move a
 * KAP or KAP-INV line. Before this fix `buildKapInputs` fed ALL matches/tx to
 * the draft, leaking crypto P/L into KAP Z22 (the −3,269 mismatch).
 */
import { describe, it, expect } from "vitest";
import { buildKapAndKapInv } from "@/lib/tax/german-tax";
import { buildInputs, dividend, match, ACCT } from "./kap-fixtures";

describe("buildKapInputs — COINBASE account scope (T2a)", () => {
  it("a COINBASE match never moves any KAP or KAP-INV line", () => {
    const stockOnly = buildKapAndKapInv(
      buildInputs(
        [dividend({ brokerAccountId: ACCT.ibkr, symbol: "AAPL", isin: "US0378331005", amountEur: "100", whtEur: "15" })],
        [match({ brokerAccountId: ACCT.ff, symbol: "MSFT", gainEur: "300" })],
      ),
    );
    const withCrypto = buildKapAndKapInv(
      buildInputs(
        [
          dividend({ brokerAccountId: ACCT.ibkr, symbol: "AAPL", isin: "US0378331005", amountEur: "100", whtEur: "15" }),
          // crypto "dividend"/reward on the COINBASE account
          dividend({ brokerAccountId: ACCT.coinbase, symbol: "ETH", amountEur: "500", whtEur: "0" }),
        ],
        [
          match({ brokerAccountId: ACCT.ff, symbol: "MSFT", gainEur: "300" }),
          // large crypto gain + loss that MUST NOT reach any KAP line
          match({ brokerAccountId: ACCT.coinbase, symbol: "BTC", gainEur: "5000" }),
          match({ brokerAccountId: ACCT.coinbase, symbol: "SOL", gainEur: "-3000" }),
        ],
      ),
    );

    // Every KAP + KAP-INV line is identical with or without the crypto rows.
    expect(withCrypto.kap.lines).toEqual(stockOnly.kap.lines);
    expect(withCrypto.kapInv.section1).toEqual(stockOnly.kapInv.section1);
    expect(withCrypto.kapInv.section2).toEqual(stockOnly.kapInv.section2);
    // And no crypto symbol appears in the evidence trail.
    const symbols = withCrypto.evidence.map((e) => e.symbol ?? e.ticker);
    expect(symbols).not.toContain("BTC");
    expect(symbols).not.toContain("SOL");
    expect(symbols).not.toContain("ETH");
  });

  it("tags each in-scope evidence row with its origin broker (T5 prep)", () => {
    const draft = buildKapAndKapInv(
      buildInputs(
        [dividend({ brokerAccountId: ACCT.ibkr, symbol: "AAPL", isin: "US0378331005", amountEur: "100", whtEur: "15" })],
        [match({ brokerAccountId: ACCT.ff, symbol: "MSFT", gainEur: "300" })],
      ),
    );
    const brokers = new Set(draft.evidence.map((e) => e.broker));
    expect(brokers.has("IBKR")).toBe(true);
    expect(brokers.has("FF")).toBe(true);
  });
});
