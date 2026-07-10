/**
 * A position merged across a ticker rename carries lots stamped with the old
 * AND new symbols (replay keys them by ISIN, not symbol). The former tickers
 * are exactly the distinct lot symbols that aren't the current display symbol
 * — surfaced in the UI as a "was SKHYV" provenance chip.
 */
import { describe, it, expect } from "vitest";
import { formerTickers } from "@/lib/analytics/former-tickers";

describe("formerTickers", () => {
  it("returns the old symbol of a renamed position", () => {
    expect(formerTickers(["SKHYV", "SKHY", "SKHY"], "SKHY")).toEqual(["SKHYV"]);
  });

  it("returns empty when every lot is the current symbol", () => {
    expect(formerTickers(["SKHY", "SKHY"], "SKHY")).toEqual([]);
  });

  it("dedupes and preserves first-seen order across a double rename", () => {
    expect(formerTickers(["OLD1", "OLD1", "OLD2", "SKHY"], "SKHY")).toEqual(["OLD1", "OLD2"]);
  });

  it("handles a display symbol not present among the lots", () => {
    expect(formerTickers(["SKHYV"], "SKHY")).toEqual(["SKHYV"]);
  });

  it("ignores empty/blank symbols", () => {
    expect(formerTickers(["", "SKHYV", ""], "SKHY")).toEqual(["SKHYV"]);
  });
});
