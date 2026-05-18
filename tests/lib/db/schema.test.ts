import { describe, it, expect } from "vitest";
import * as schema from "@/lib/db/schema";

describe("schema exports", () => {
  it("exposes the expected tables", () => {
    const expected = [
      "user", "session", "account", "verification",
      "brokerAccounts", "imports", "instruments", "transactions",
      "positions", "fxRates", "lots", "realizedMatches",
      "quoteCache", "userSettings", "taxReports", "taxReportLines",
    ];
    for (const name of expected) expect((schema as Record<string, unknown>)[name]).toBeDefined();
  });

  it("fx_rates has no owner column", () => {
    const cols = Object.keys(schema.fxRates as object);
    expect(cols).not.toContain("ownerUserId");
  });
});
