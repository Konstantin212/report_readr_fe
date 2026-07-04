/**
 * Defensive accruals filter — regression guard.
 *
 * Context: when the GF filed her 2025 return, our app's Z19 was €139.63
 * but her actual cash dividends paid were €127.30. The €12.33 delta
 * matched her year-end IBKR dividend-accrual balance exactly. We never
 * reproduced the leak in the parser code (the IBKR parser only reads
 * the "Dividends" section, not "Change in Dividend Accruals"), but the
 * defensive filter catches any future statement-variant edge case where
 * an accrual row ends up tagged as DIVIDEND.
 *
 * Zuflussprinzip (§11 EStG): only money that has actually been received
 * counts. Accrued-but-unpaid dividends are next year's income.
 */
import { describe, it, expect } from "vitest";
import { isAccrualSource } from "@/lib/tax/kap-inputs";

describe("isAccrualSource", () => {
  it("matches the canonical IBKR accruals section name", () => {
    expect(isAccrualSource("Change in Dividend Accruals")).toBe(true);
  });

  it("matches variants with different casing or surrounding text", () => {
    expect(isAccrualSource("Dividend Accruals")).toBe(true);
    expect(isAccrualSource("CHANGE IN DIVIDEND ACCRUAL")).toBe(true); // singular too
    expect(isAccrualSource("accrual-only")).toBe(true);
  });

  it("does NOT match the legitimate Dividends source", () => {
    expect(isAccrualSource("Dividends")).toBe(false);
    expect(isAccrualSource("dividends.detailed")).toBe(false);
    expect(isAccrualSource("cash_flows.detailed")).toBe(false);
  });

  it("handles null / undefined / empty without crashing", () => {
    expect(isAccrualSource(null)).toBe(false);
    expect(isAccrualSource(undefined)).toBe(false);
    expect(isAccrualSource("")).toBe(false);
  });
});
