import { describe, it, expect } from "vitest";
import { classifyKind } from "@/lib/analytics/sector-map";

describe("classifyKind", () => {
  it("classifies known ETF symbols as etf", () => {
    expect(classifyKind("SPYW")).toBe("etf");
    expect(classifyKind("EUDI")).toBe("etf");
  });
  it("classifies a normalized US treasury as bond", () => {
    expect(classifyKind("T 4 5/8 09/15/26")).toBe("bond");
  });
  it("uses raw symbol to detect bond when normalized symbol is missing", () => {
    expect(classifyKind("", undefined, "T 4 5/8 09/15/26 4.5%")).toBe("bond");
  });
  it("defaults to stock for plain tickers", () => {
    expect(classifyKind("AAPL")).toBe("stock");
    expect(classifyKind("ASML")).toBe("stock");
  });
  it("ETF sector wins over default stock", () => {
    expect(classifyKind("UNKNOWN_TICKER", "ETF")).toBe("etf");
  });
});
