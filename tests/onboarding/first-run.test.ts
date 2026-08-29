import { describe, expect, it } from "vitest";

import { isFirstRun } from "@/lib/onboarding/first-run";

/**
 * AC-OC3.1 / AC-OC3.6 — the full truth table. The `(0, true)` row is the
 * whole reason this predicate lives in its own module: a Coinbase-only user
 * has zero imports but real positions and must never see the first-run card.
 */
describe("isFirstRun", () => {
  it("is true for an account with no imports and no crypto account", () => {
    expect(isFirstRun({ importCount: 0, hasCryptoAccounts: false })).toBe(true);
  });

  it("is false once at least one statement has been imported", () => {
    expect(isFirstRun({ importCount: 1, hasCryptoAccounts: false })).toBe(false);
  });

  it("is false for a Coinbase-only user with zero imports (AC-OC3.6)", () => {
    expect(isFirstRun({ importCount: 0, hasCryptoAccounts: true })).toBe(false);
  });

  it("is false when the account has both kinds of data", () => {
    expect(isFirstRun({ importCount: 3, hasCryptoAccounts: true })).toBe(false);
  });
});
