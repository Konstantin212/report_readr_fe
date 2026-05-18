import { describe, it, expect } from "vitest";
import { buildAnlageKap } from "@/lib/tax/german-tax";

describe("buildAnlageKap — golden 2025 fixture", () => {
  it("computes the seven KAP lines for a small fixture", () => {
    const draft = buildAnlageKap({
      taxYear: 2025,
      settings: { filingStatus: "SINGLE", saverAllowance: "1000" },
      dividends: [{ ticker: "JPM", country: "US", grossEur: "500", whtEur: "75" }],
      interest: [],
      matches: [
        { symbol: "AAPL", gainEur: "1200", closedAt: "2025-04-04" },
        { symbol: "TSLA", gainEur: "-200", closedAt: "2025-05-04" },
      ],
    });
    expect(draft.lines.Z19).toBe("500.00");
    expect(draft.lines.Z20).toBe("500.00");
    expect(draft.lines.Z22).toBe("1000.00"); // 1200 - 200
    expect(draft.lines.Z51).toBe("75.00");
    expect(draft.lines.Z52).toBe("75.00"); // within 15% cap (15% of 500 = 75)
  });
});
