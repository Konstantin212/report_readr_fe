/**
 * Pure parser for ticker/symbol-change corporate actions.
 *
 * IBKR reports a rename in the Corporate Actions section with a description
 * that leads with SYMBOL(ISIN) — the same shape as the split form
 * "SCHD(US8085247976) Split 3 for 1 (...)". A when-issued → permanent change
 * (SK hynix ADR SKHYV → SKHY on 2025-07-13) keeps the same ISIN; a CUSIP/ISIN
 * change carries a new destination ISIN. We key the surviving position by the
 * DESTINATION identity, so the destination ISIN wins when both are present.
 */
import { describe, it, expect } from "vitest";
import { parseSymbolChange } from "@/lib/ledger/corporate-actions";

describe("parseSymbolChange", () => {
  it("parses a when-issued symbol change (same ISIN both sides)", () => {
    expect(parseSymbolChange("SKHYV(US78392J1007) Symbol Change to SKHY(US78392J1007)")).toEqual({
      fromSymbol: "SKHYV",
      toSymbol: "SKHY",
      isin: "US78392J1007",
      fromIsin: "US78392J1007",
    });
  });

  it("returns BOTH the destination and source isin on a CUSIP/ISIN change", () => {
    expect(parseSymbolChange("SKHYV(US78392J1007) CUSIP/ISIN Change to SKHY(US78392J1008)")).toEqual({
      fromSymbol: "SKHYV",
      toSymbol: "SKHY",
      isin: "US78392J1008",
      fromIsin: "US78392J1007",
    });
  });

  it("parses a ticker change with no ISIN in the description", () => {
    expect(parseSymbolChange("ABCD Ticker Change to WXYZ")).toEqual({
      fromSymbol: "ABCD",
      toSymbol: "WXYZ",
      isin: undefined,
      fromIsin: undefined,
    });
  });

  it("supports an arrow form", () => {
    expect(parseSymbolChange("SKHYV(US78392J1007) → SKHY(US78392J1007) Ticker Change")).toEqual({
      fromSymbol: "SKHYV",
      toSymbol: "SKHY",
      isin: "US78392J1007",
      fromIsin: "US78392J1007",
    });
  });

  it("ignores a split description", () => {
    expect(parseSymbolChange("SCHD(US8085247976) Split 3 for 1 (SCHD, SCHWAB US DIVIDEND EQUITY ETF, US8085247976)")).toBeNull();
  });

  it("ignores unrelated corporate actions and empty input", () => {
    expect(parseSymbolChange("Cash Dividend USD 0.25 per Share")).toBeNull();
    expect(parseSymbolChange(undefined)).toBeNull();
    expect(parseSymbolChange("")).toBeNull();
  });

  it("returns null when from and to would be identical", () => {
    expect(parseSymbolChange("SKHY Symbol Change to SKHY")).toBeNull();
  });
});
