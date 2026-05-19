import { describe, it, expect } from "vitest";
import { toYahooSymbol } from "@/lib/quotes/symbol-map";

describe("Yahoo symbol mapping for canonicalized tickers", () => {
  it("maps EVO to Stockholm exchange", () => {
    expect(toYahooSymbol("EVO")).toBe("EVO.ST");
  });
  it("maps TRN to LSE", () => {
    expect(toYahooSymbol("TRN")).toBe("TRN.L");
  });
  it("maps SPYW to German exchange", () => {
    expect(toYahooSymbol("SPYW")).toBe("SPYW.DE");
  });
  it("passes through unmapped tickers unchanged", () => {
    expect(toYahooSymbol("COIN")).toBe("COIN");
    expect(toYahooSymbol("AAPL")).toBe("AAPL");
  });
});
