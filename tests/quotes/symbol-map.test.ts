import { describe, it, expect } from "vitest";
import { toYahooSymbol, toTwelveDataSymbol } from "@/lib/quotes/symbol-map";

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

describe("Twelve Data symbol mapping (SYMBOL:EXCHANGE format)", () => {
  it("CRITICAL: disambiguates TRN so we get Trainline on LSE, not Trinity Industries on NYSE", () => {
    // The Twelve Data /symbol_search for "TRN" returns Trainline (LSE,
    // GBp), Terna (Milan, EUR), Trinity Industries (NYSE, USD), and
    // others. Bare "TRN" silently resolves to the US listing — which
    // would write a totally unrelated company's price into our cache.
    expect(toTwelveDataSymbol("TRN")).toBe("TRN:LSE");
  });

  it("qualifies UCITS ETFs with their Amsterdam (Euronext) listing", () => {
    expect(toTwelveDataSymbol("VHYL")).toBe("VHYL:Euronext");
    expect(toTwelveDataSymbol("VUSA")).toBe("VUSA:Euronext");
    expect(toTwelveDataSymbol("IEMM")).toBe("IEMM:Euronext");
  });

  it("qualifies German exchange tickers with XETR", () => {
    expect(toTwelveDataSymbol("XSX7")).toBe("XSX7:XETR");
    expect(toTwelveDataSymbol("SPYW")).toBe("SPYW:XETR");
    // RY4C is Freedom24's alias for Ryanair on Xetra — TD knows it
    // under exactly that ticker (only on XETR/FSX/Munich).
    expect(toTwelveDataSymbol("RY4C")).toBe("RY4C:XETR");
  });

  it("qualifies Stockholm-listed shares with OMXSTO", () => {
    expect(toTwelveDataSymbol("EVO")).toBe("EVO:OMXSTO");
  });

  it("passes US tickers through unchanged — TD picks the primary listing", () => {
    expect(toTwelveDataSymbol("AAPL")).toBe("AAPL");
    expect(toTwelveDataSymbol("SPY")).toBe("SPY");
    expect(toTwelveDataSymbol("O")).toBe("O");
  });
});
