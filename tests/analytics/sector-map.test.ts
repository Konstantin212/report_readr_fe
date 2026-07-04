import { describe, expect, it } from "vitest";
import { classifySector, normalizeSector } from "@/lib/analytics/sector-map";

describe("classifySector", () => {
  it("returns the mapped sector for a known symbol", () => {
    expect(classifySector("NVDA")).toBe("Tech");
    expect(classifySector("JPM")).toBe("Financials");
    expect(classifySector("LLY")).toBe("Healthcare");
    expect(classifySector("TSLA")).toBe("Consumer");
    expect(classifySector("SPYW")).toBe("ETF");
  });

  it("classifies previously-'Other' holdings into real sectors", () => {
    expect(classifySector("PYPL")).toBe("Financials");
    expect(classifySector("C")).toBe("Financials");
    expect(classifySector("O")).toBe("Real Estate");
    expect(classifySector("DIS")).toBe("Communication");
    expect(classifySector("RY4C")).toBe("Industrials");
    expect(classifySector("IEMM")).toBe("ETF");
  });

  it("returns 'Other' for an unknown symbol", () => {
    expect(classifySector("XYZ123")).toBe("Other");
    expect(classifySector("")).toBe("Other");
  });

  it("is case-sensitive: lowercase does not match", () => {
    expect(classifySector("nvda")).toBe("Other");
    expect(classifySector("Nvda")).toBe("Other");
  });
});

describe("normalizeSector", () => {
  it("folds provider spellings into one canonical label", () => {
    expect(normalizeSector("Technology")).toBe("Tech");
    expect(normalizeSector("Tech")).toBe("Tech");
    expect(normalizeSector("Financial Services")).toBe("Financials");
    expect(normalizeSector("Consumer Cyclical")).toBe("Consumer");
    expect(normalizeSector("Basic Materials")).toBe("Materials");
    expect(normalizeSector("Communication Services")).toBe("Communication");
  });
  it("defaults empty/nullish to Other and title-cases unknowns", () => {
    expect(normalizeSector(null)).toBe("Other");
    expect(normalizeSector("")).toBe("Other");
    expect(normalizeSector("aerospace")).toBe("Aerospace");
  });
});
