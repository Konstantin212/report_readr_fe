import { describe, expect, it } from "vitest";
import { classifySector } from "@/lib/analytics/sector-map";

describe("classifySector", () => {
  it("returns the mapped sector for a known symbol", () => {
    expect(classifySector("NVDA")).toBe("Tech");
    expect(classifySector("JPM")).toBe("Financials");
    expect(classifySector("LLY")).toBe("Healthcare");
    expect(classifySector("TSLA")).toBe("Consumer");
    expect(classifySector("SPYW")).toBe("ETF");
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
