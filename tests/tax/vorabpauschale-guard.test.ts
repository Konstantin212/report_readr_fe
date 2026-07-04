/**
 * Vorabpauschale guard (§18/§19 InvStG) — v1 behavior.
 *
 * The app cannot yet COMPUTE the Vorabpauschale (needs year-boundary NAVs),
 * but it must never produce a silently-incomplete draft when accumulating
 * funds are involved: held-over-year-end funds and sold funds both get loud,
 * specific warnings. Portfolios without accumulating funds are unaffected.
 */
import { describe, it, expect } from "vitest";
import type { transactions } from "@/lib/db/schema";
import { buildKapAndKapInv } from "@/lib/tax/german-tax";
import { ACCT, buildInputs, match } from "./kap-fixtures";

type TxRow = typeof transactions.$inferSelect;

function trade(o: {
  brokerAccountId: string;
  symbol: string;
  isin?: string;
  qty: string;
  date: string;
}): TxRow {
  return {
    eventType: "TRADE",
    eventDate: o.date,
    brokerAccountId: o.brokerAccountId,
    symbol: o.symbol,
    isin: o.isin ?? null,
    quantity: o.qty,
    amountEur: "0",
    withholdingTaxEur: "0",
    source: null,
  } as unknown as TxRow;
}

const ACC_ETF = {
  symbol: "VUAA",
  isin: "IE00BFMXXD54", // Vanguard S&P 500 Acc
};
const ACC_CLS = {
  [ACC_ETF.symbol]: { kind: "etf" as const, subtype: "aktien" as const, accumulating: true },
  [ACC_ETF.isin]: { kind: "etf" as const, subtype: "aktien" as const, accumulating: true },
};

describe("Vorabpauschale guard (§18/§19 InvStG)", () => {
  it("warns for an accumulating fund held over the prior year end", () => {
    const tx = [
      trade({ brokerAccountId: ACCT.ibkr, ...ACC_ETF, qty: "10", date: "2024-05-01" }),
    ];
    const inputs = buildInputs(tx, [], ACC_CLS);
    expect(inputs.accumulatingFunds?.heldAtPriorYearEnd).toEqual(["VUAA"]);

    const draft = buildKapAndKapInv(inputs);
    const w = draft.warnings.find((x) => x.includes("VUAA") && x.includes("§18 InvStG"));
    expect(w).toBeDefined();
    expect(w).toContain("31.12.2024");
    expect(w).toContain("Basiszins(2024)");
    expect(w).toContain("Anlage KAP-INV");
  });

  it("does not flag a fund fully closed before the prior year end", () => {
    const tx = [
      trade({ brokerAccountId: ACCT.ibkr, ...ACC_ETF, qty: "10", date: "2024-03-01" }),
      trade({ brokerAccountId: ACCT.ibkr, ...ACC_ETF, qty: "-10", date: "2024-11-01" }),
    ];
    const inputs = buildInputs(tx, [], ACC_CLS);
    expect(inputs.accumulatingFunds?.heldAtPriorYearEnd ?? []).toEqual([]);
  });

  it("warns §19 for an accumulating fund sold during the tax year", () => {
    const tx = [
      trade({ brokerAccountId: ACCT.ibkr, ...ACC_ETF, qty: "10", date: "2024-05-01" }),
    ];
    const matches = [
      { ...match({ brokerAccountId: ACCT.ibkr, symbol: "VUAA", gainEur: "500" }), isin: ACC_ETF.isin },
    ];
    const inputs = buildInputs(tx, matches as never, ACC_CLS);
    expect(inputs.accumulatingFunds?.soldInYear).toEqual(["VUAA"]);

    const draft = buildKapAndKapInv(inputs);
    const w = draft.warnings.find((x) => x.includes("VUAA") && x.includes("§19 InvStG"));
    expect(w).toBeDefined();
    expect(w).toContain("UNREDUCED FIFO gain");
  });

  it("leaves distributing-fund portfolios completely untouched", () => {
    const tx = [
      trade({ brokerAccountId: ACCT.ibkr, symbol: "SPYW", isin: "IE00B5M1WJ87", qty: "100", date: "2024-05-01" }),
    ];
    const cls = { SPYW: { kind: "etf" as const, subtype: "aktien" as const } };
    const inputs = buildInputs(tx, [], cls);
    expect(inputs.accumulatingFunds).toBeUndefined();

    const draft = buildKapAndKapInv(inputs);
    expect(draft.warnings.filter((x) => x.includes("InvStG") && x.includes("Vorabpauschale"))).toEqual([]);
  });

  it("classification without the accumulating flag never triggers the guard", () => {
    const draft = buildKapAndKapInv({
      taxYear: 2025,
      settings: { filingStatus: "SINGLE", saverAllowance: "1000" },
      dividends: [],
      interest: [],
      matches: [],
    });
    expect(draft.warnings).toEqual([]);
  });
});
