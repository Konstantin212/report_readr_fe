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

  it("extracts at least one trade with a real ISO date", () => {
    const trades = result.events.filter(e => e.type === "TRADE");
    expect(trades.length).toBeGreaterThan(0);
    expect(trades.every(t => /^\d{4}-\d{2}-\d{2}$/.test(t.date))).toBe(true);
  });

  it("buy and sell trades have signed quantities", () => {
    const trades = result.events.filter(e => e.type === "TRADE");
    expect(trades.some(t => Number(t.quantity) > 0)).toBe(true);
    const sells = trades.filter(t => /sell|sale/i.test(t.description ?? ""));
    if (sells.length > 0) expect(sells.every(t => Number(t.quantity) < 0)).toBe(true);
  });

  it("properly redacted account number in output", () => {
    expect(result.account.accountNumber).toBe("FF-TEST");
    expect(result.account.accountNumber).not.toContain("201743");
  });
});
