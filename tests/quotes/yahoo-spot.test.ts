import { describe, it, expect } from "vitest";
import { YAHOO_PRIMARY_SYMBOLS } from "@/lib/quotes/yahoo-spot";

describe("Yahoo fallback routing", () => {
  it("routes IEMM through Yahoo (Stooq lacks IEMM.AS coverage)", () => {
    expect(YAHOO_PRIMARY_SYMBOLS.has("IEMM")).toBe(true);
  });

  it("leaves the rest of the universe on Stooq", () => {
    for (const s of ["COIN", "TSM", "BLBD", "SONY", "TRN", "GOOGL", "CRCL", "VHYL", "VUSA", "SPYW", "XSX7"]) {
      expect(YAHOO_PRIMARY_SYMBOLS.has(s)).toBe(false);
    }
  });
});
