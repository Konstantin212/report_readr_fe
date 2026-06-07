/**
 * IBKR snapshot-quote extraction.
 *
 * Mirrors the Freedom Finance snapshot test in shape. The fixture is a
 * compact, self-contained CSV with one Account Information section, two
 * Financial Instrument Information rows (one of which canonicalises
 * `TRNl → TRN` via the Underlying column), an Open Positions section
 * containing per-position Summary rows AND a Total row that must be
 * filtered out, and a couple of garbage rows (missing price, missing
 * symbol) that must be dropped.
 */
import { describe, it, expect } from "vitest";
import { parseBrokerStatement } from "@/lib/brokers";

function csv(): ArrayBuffer {
  return new TextEncoder().encode(
`Statement,Header,Field Name,Field Value
Statement,Data,BrokerName,Interactive Brokers Ireland Limited
Statement,Data,Period,"January 1, 2026 - June 5, 2026"
Account Information,Header,Field Name,Field Value
Account Information,Data,Account,U00000000
Account Information,Data,Base Currency,EUR
Financial Instrument Information,Header,Asset Category,Symbol,Description,Conid,Security ID,Underlying,Listing Exch,Multiplier,Type,Code
Financial Instrument Information,Data,Stocks,TRNl,TRAINLINE PLC,371871705,GB00BKDTK925,TRN,LSE,1,COMMON,
Financial Instrument Information,Data,Stocks,RBRK,RUBRIK INC-A,612231984,US78124M2061,RBRK,NASDAQ,1,COMMON,
Open Positions,Header,DataDiscriminator,Asset Category,Currency,Symbol,Quantity,Mult,Cost Price,Cost Basis,Close Price,Value,Unrealized P/L,Code
Open Positions,Data,Summary,Stocks,USD,RBRK,4.7667,1,85.17,405.99,73.41,349.92,-56.07,
Open Positions,Data,Summary,Stocks,GBP,TRNl,441.0319,1,2.2467,990.89,2.272,1002.02,11.12,
Open Positions,Data,Summary,Stocks,USD,BADROW,1,1,0,0,0,0,0,
Open Positions,Data,Summary,Stocks,USD,,1,1,1,1,1,1,0,
Open Positions,Total,,Stocks,USD,,,,,1396.88,,1351.94,-44.95,
`
  ).buffer as ArrayBuffer;
}

describe("IBKR snapshot-quote extraction", () => {
  it("captures one quote per Open Positions Summary row, skipping totals and bad rows", () => {
    const parsed = parseBrokerStatement({
      broker: "INTERACTIVE_BROKERS",
      fileName: "U00000000_20260101_20260605.csv",
      bytes: csv(),
      taxYear: 2026,
    });
    // RBRK passes (priced); TRNl is remapped to TRN; BADROW has zero
    // close price; the row with empty Symbol drops; the Total row is
    // filtered by the DataDiscriminator check.
    expect((parsed.snapshotQuotes ?? []).map((q) => q.symbol).sort()).toEqual(["RBRK", "TRN"]);
  });

  it("each quote carries source IBKR_SNAPSHOT", () => {
    const parsed = parseBrokerStatement({
      broker: "INTERACTIVE_BROKERS",
      fileName: "U00000000_20260101_20260605.csv",
      bytes: csv(),
      taxYear: 2026,
    });
    expect((parsed.snapshotQuotes ?? []).every((q) => q.source === "IBKR_SNAPSHOT")).toBe(true);
  });

  it("uses statement end date for every quote", () => {
    const parsed = parseBrokerStatement({
      broker: "INTERACTIVE_BROKERS",
      fileName: "U00000000_20260101_20260605.csv",
      bytes: csv(),
      taxYear: 2026,
    });
    for (const q of parsed.snapshotQuotes ?? []) {
      expect(q.date).toBe("2026-06-05");
    }
  });

  it("canonicalises TRNl → TRN via the Financial Instrument Information section", () => {
    const parsed = parseBrokerStatement({
      broker: "INTERACTIVE_BROKERS",
      fileName: "U00000000_20260101_20260605.csv",
      bytes: csv(),
      taxYear: 2026,
    });
    const trn = (parsed.snapshotQuotes ?? []).find((q) => q.symbol === "TRN");
    expect(trn).toBeDefined();
    expect(trn?.currency).toBe("GBP");
    expect(Number(trn?.close)).toBeCloseTo(2.272, 3);
  });

  it("returns an empty array when the statement has no end date", () => {
    // No "Period" line → statementDates.endDate is undefined.
    const bytes = new TextEncoder().encode(
`Statement,Header,Field Name,Field Value
Statement,Data,BrokerName,Interactive Brokers Ireland Limited
Account Information,Header,Field Name,Field Value
Account Information,Data,Account,U00000000
Open Positions,Header,DataDiscriminator,Asset Category,Currency,Symbol,Quantity,Mult,Cost Price,Cost Basis,Close Price,Value,Unrealized P/L,Code
Open Positions,Data,Summary,Stocks,USD,RBRK,4.7667,1,85.17,405.99,73.41,349.92,-56.07,
`
    ).buffer as ArrayBuffer;
    const parsed = parseBrokerStatement({
      broker: "INTERACTIVE_BROKERS",
      fileName: "x.csv",
      bytes,
      taxYear: 2026,
    });
    expect(parsed.snapshotQuotes).toEqual([]);
  });
});
