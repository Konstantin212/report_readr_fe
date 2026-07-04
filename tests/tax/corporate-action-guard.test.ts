/**
 * Corporate-action prevention guards — the tax draft must never ship
 * silently-wrong numbers when the FIFO engine hit something it can't model:
 * mergers/spin-offs, split rows in an unrecognized shape, or sells whose
 * quantity isn't fully covered by matched acquisition lots.
 */
import { describe, it, expect } from "vitest";
import type { transactions, realizedMatches } from "@/lib/db/schema";
import { buildKapAndKapInv } from "@/lib/tax/german-tax";
import { ACCT, buildInputs } from "./kap-fixtures";

type TxRow = typeof transactions.$inferSelect;
type MatchRow = typeof realizedMatches.$inferSelect;

function tx(o: Partial<TxRow> & { eventType: TxRow["eventType"]; eventDate: string; brokerAccountId: string }): TxRow {
  return { symbol: null, isin: null, quantity: null, amountEur: "0", withholdingTaxEur: "0", source: null, description: null, ...o } as unknown as TxRow;
}

function m(o: { symbol: string; isin?: string; gainEur: string; qty?: string }): MatchRow {
  return {
    brokerAccountId: ACCT.ibkr,
    symbol: o.symbol,
    isin: o.isin ?? null,
    gainEur: o.gainEur,
    qty: o.qty ?? "10",
    closedAt: "2025-07-01",
    costEur: "0",
    proceedsEur: "0",
  } as unknown as MatchRow;
}

describe("corporate-action prevention guards", () => {
  it("warns when an unmodeled corporate action touches a matched identity", () => {
    const rows = [
      tx({ eventType: "CORPORATE_ACTION", eventDate: "2025-03-01", brokerAccountId: ACCT.ibkr, symbol: "ABC", isin: "US0000000001", description: "Merger (Acquisition of ABC by XYZ)" }),
      // The sell that produced the match, fully covered.
      tx({ eventType: "TRADE", eventDate: "2025-07-01", brokerAccountId: ACCT.ibkr, symbol: "ABC", isin: "US0000000001", quantity: "-10" }),
    ];
    const matches = [m({ symbol: "ABC", isin: "US0000000001", gainEur: "100", qty: "10" })];
    const inputs = buildInputs(rows, matches as never);
    const draft = buildKapAndKapInv(inputs);
    const w = draft.warnings.find((x) => x.includes("ABC") && x.includes("not modeled"));
    expect(w).toBeDefined();
    expect(w).toContain("Merger");
  });

  it("stays silent for an unmodeled action on an identity WITHOUT matches this year", () => {
    const rows = [
      tx({ eventType: "CORPORATE_ACTION", eventDate: "2025-03-01", brokerAccountId: ACCT.ibkr, symbol: "HELD", isin: "US0000000002", description: "Spin-off" }),
    ];
    const inputs = buildInputs(rows, []);
    expect(inputs.corporateActionAlerts).toBeUndefined();
  });

  it("warns for a split shape the replay cannot apply (lone leg, no ratio text)", () => {
    const rows = [
      tx({ eventType: "CORPORATE_ACTION", eventDate: "2024-10-11", brokerAccountId: ACCT.ff, symbol: "LON", isin: "US0000000003", description: "split", quantity: "-34" }),
      tx({ eventType: "TRADE", eventDate: "2025-07-01", brokerAccountId: ACCT.ff, symbol: "LON", isin: "US0000000003", quantity: "-10" }),
    ];
    const matches = [m({ symbol: "LON", isin: "US0000000003", gainEur: "50", qty: "10" })];
    const inputs = buildInputs(rows, matches as never);
    const w = inputs.corporateActionAlerts?.find((x) => x.includes("LON") && x.includes("could not apply"));
    expect(w).toBeDefined();
  });

  it("accepts handled split shapes without warning (pair + ratio-text)", () => {
    const rows = [
      // FF pair
      tx({ eventType: "CORPORATE_ACTION", eventDate: "2024-10-11", brokerAccountId: ACCT.ff, symbol: "OKP", isin: "US0000000004", description: "split", quantity: "-34" }),
      tx({ eventType: "CORPORATE_ACTION", eventDate: "2024-10-11", brokerAccountId: ACCT.ff, symbol: "OKP", isin: "US0000000004", description: "split", quantity: "102" }),
      // IBKR ratio text
      tx({ eventType: "CORPORATE_ACTION", eventDate: "2024-10-11", brokerAccountId: ACCT.ibkr, symbol: "OKR", isin: "US0000000005", description: "OKR(US0000000005) Split 3 for 1", quantity: "68" }),
      tx({ eventType: "TRADE", eventDate: "2025-07-01", brokerAccountId: ACCT.ff, symbol: "OKP", isin: "US0000000004", quantity: "-10" }),
      tx({ eventType: "TRADE", eventDate: "2025-07-01", brokerAccountId: ACCT.ibkr, symbol: "OKR", isin: "US0000000005", quantity: "-10" }),
    ];
    const matches = [
      m({ symbol: "OKP", isin: "US0000000004", gainEur: "10", qty: "10" }),
      m({ symbol: "OKR", isin: "US0000000005", gainEur: "10", qty: "10" }),
    ];
    const inputs = buildInputs(rows, matches as never);
    expect(inputs.corporateActionAlerts ?? []).toEqual([]);
  });

  it("warns when sold quantity is not fully covered by matched lots", () => {
    const rows = [
      tx({ eventType: "TRADE", eventDate: "2025-07-01", brokerAccountId: ACCT.ibkr, symbol: "GAP", isin: "US0000000006", quantity: "-100" }),
    ];
    // Only 40 of the 100 sold shares were matched against lots.
    const matches = [m({ symbol: "GAP", isin: "US0000000006", gainEur: "10", qty: "40" })];
    const inputs = buildInputs(rows, matches as never);
    const w = inputs.corporateActionAlerts?.find((x) => x.includes("GAP") && x.includes("NO matched acquisition lots"));
    expect(w).toBeDefined();
    expect(w).toContain("60 of 100");
    // and it reaches the draft warnings
    const draft = buildKapAndKapInv(inputs);
    expect(draft.warnings.some((x) => x.includes("GAP"))).toBe(true);
  });

  it("fully covered sells produce no coverage warning", () => {
    const rows = [
      tx({ eventType: "TRADE", eventDate: "2025-07-01", brokerAccountId: ACCT.ibkr, symbol: "FULL", isin: "US0000000007", quantity: "-10" }),
    ];
    const matches = [m({ symbol: "FULL", isin: "US0000000007", gainEur: "10", qty: "10" })];
    const inputs = buildInputs(rows, matches as never);
    expect(inputs.corporateActionAlerts ?? []).toEqual([]);
  });
});
