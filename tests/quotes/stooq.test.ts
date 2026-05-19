import { describe, it, expect } from "vitest";
import { toStooqSymbol } from "@/lib/quotes/stooq-symbol-map";

describe("Stooq symbol mapping", () => {
  it("maps US tickers to .us suffix", () => {
    expect(toStooqSymbol("COIN")).toBe("coin.us");
    expect(toStooqSymbol("BLBD")).toBe("blbd.us");
  });

  it("maps LSE tickers to .uk", () => {
    expect(toStooqSymbol("TRN")).toBe("trn.uk");
    expect(toStooqSymbol("VHYL")).toBe("vhyl.uk");
    expect(toStooqSymbol("VUSA")).toBe("vusa.uk");
  });

  it("maps Xetra tickers to .de", () => {
    expect(toStooqSymbol("SPYW")).toBe("spyw.de");
    expect(toStooqSymbol("XSX7")).toBe("xsx7.de");
  });

  it("maps Stockholm tickers to .se", () => {
    expect(toStooqSymbol("EVO")).toBe("evo.se");
  });

  it("maps S&P 500 benchmark", () => {
    expect(toStooqSymbol("^GSPC")).toBe("^spx");
  });

  it("defaults to .us for unknown tickers", () => {
    expect(toStooqSymbol("UNKNOWN")).toBe("unknown.us");
  });
});
