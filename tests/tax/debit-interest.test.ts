/**
 * Debit interest is not deductible capital income — §20 Abs. 9 EStG.
 *
 * Context: the 2025 reconciliation found our interest total was €32.43 where
 * the gross received interest was €33.30. The €0.87 delta was IBKR margin
 * "Debit Interest" rows being netted against income. Sollzinsen are
 * Werbungskosten, and §20 Abs. 9 allows no deduction beyond the
 * Sparer-Pauschbetrag — so they must not reduce the interest total.
 *
 * The distinction matters and is NOT simply "drop negatives": accrued
 * interest PAID when buying a bond (Stückzinsen) is also negative but IS
 * negative capital income under §20 Abs. 1 Nr. 7 and must survive the filter.
 */
import { describe, it, expect } from "vitest";
import { isNonDeductibleInterest } from "@/lib/tax/kap-inputs";

describe("isNonDeductibleInterest", () => {
  it("matches IBKR margin debit-interest rows", () => {
    expect(isNonDeductibleInterest("EUR Debit Interest for Jan-2025")).toBe(true);
    expect(isNonDeductibleInterest("USD Debit Interest for Apr-2025")).toBe(true);
  });

  it("matches casing and spacing variants", () => {
    expect(isNonDeductibleInterest("debit interest")).toBe(true);
    expect(isNonDeductibleInterest("DEBIT  INTEREST for May")).toBe(true);
  });

  it("keeps genuine interest INCOME", () => {
    expect(isNonDeductibleInterest("Bond Coupon Payment (C Float 06/09/27)")).toBe(false);
    expect(isNonDeductibleInterest("Credit Interest for Mar-2025")).toBe(false);
    expect(isNonDeductibleInterest("Net Interest Paid to 'Savings'")).toBe(false);
  });

  it("keeps Stückzinsen paid on a bond purchase (negative but deductible)", () => {
    // Accrued interest paid on acquisition is negative capital income under
    // §20 Abs. 1 Nr. 7 — a blanket negative filter would wrongly drop it.
    expect(isNonDeductibleInterest("Purchase Accrued Interest C Float 06/09/27")).toBe(false);
    expect(isNonDeductibleInterest("Sold Accrued Interest C Float 06/09/27")).toBe(false);
  });

  it("handles null / undefined / empty without crashing", () => {
    expect(isNonDeductibleInterest(null)).toBe(false);
    expect(isNonDeductibleInterest(undefined)).toBe(false);
    expect(isNonDeductibleInterest("")).toBe(false);
  });
});
