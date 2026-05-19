import { describe, it, expect } from "vitest";
import { toStooqSymbol, resolveStooq } from "@/lib/quotes/stooq-symbol-map";

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

  it("routes IEMM to its LSE twin EIMI (Stooq has no Amsterdam listing)", () => {
    expect(toStooqSymbol("IEMM")).toBe("eimi.uk");
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

  describe("scale", () => {
    it("scales LSE ordinary shares by 0.01 (pence → GBP)", () => {
      expect(resolveStooq("TRN")).toEqual({ stooq: "trn.uk", scale: 0.01 });
    });

    it("keeps LSE UCITS ETFs at unit scale", () => {
      expect(resolveStooq("VHYL").scale).toBe(1);
      expect(resolveStooq("VUSA").scale).toBe(1);
      expect(resolveStooq("IEMM").scale).toBe(1);
    });

    it("keeps US tickers at unit scale", () => {
      expect(resolveStooq("COIN").scale).toBe(1);
      expect(resolveStooq("UNKNOWN").scale).toBe(1);
    });
  });
});
