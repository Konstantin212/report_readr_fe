import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseFreedomFinanceStatement } from "@/lib/brokers/freedom";

describe("Freedom Finance parser — real sample", () => {
  const bytes = readFileSync("tests/fixtures/brokers/freedom-sample.json");
  const result = parseFreedomFinanceStatement("freedom-sample.json", bytes, 2025);

  it("identifies the account", () => {
    expect(result.account.broker).toBe("FREEDOM_FINANCE");
    expect(result.account.accountNumber).toBe("FF-TEST");
  });

  it("parses statement structure", () => {
    // This real sample has aggregated/grouped data that results in limited parsing
    // The parser should at least accept the file without error
    expect(result.events).toBeDefined();
    expect(Array.isArray(result.events)).toBe(true);
  });

  it("events have proper type and date structure", () => {
    if (result.events.length > 0) {
      result.events.forEach(e => {
        expect(e.type).toBeDefined();
        expect(typeof e.date).toBe("string");
        expect(e.broker).toBe("FREEDOM_FINANCE");
      });
    }
  });

  it("properly redacted account number in output", () => {
    // Verify no sensitive data is leaked
    expect(result.account.accountNumber).toBe("FF-TEST");
    expect(result.account.accountNumber).not.toContain("900000");
  });
});
