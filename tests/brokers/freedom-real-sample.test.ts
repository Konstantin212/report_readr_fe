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

  it("parses trades, cash flows, commissions", () => {
    const types = new Set(result.events.map(e => e.type));
    expect(types.has("TRADE")).toBe(true);
    expect(types.has("FEE")).toBe(true);
  });

  it("dates are ISO YYYY-MM-DD", () => {
    expect(result.events.every(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date))).toBe(true);
  });

  it("sell trades have negative quantity", () => {
    const sells = result.events.filter(e => e.type === "TRADE" && Number(e.quantity) < 0);
    expect(sells.length).toBeGreaterThan(0);
  });
});
