import { describe, it, expect } from "vitest";
import { marginalRatePct, guenstigerpruefungRecommended } from "@/lib/tax/marginal-rate";

describe("marginalRatePct (§32a EStG 2025)", () => {
  it("is 0 up to the Grundfreibetrag", () => {
    expect(marginalRatePct(0)).toBe(0);
    expect(marginalRatePct(12_096)).toBe(0);
  });

  it("starts around 14 % just above the Grundfreibetrag", () => {
    const r = marginalRatePct(12_200);
    expect(r).toBeGreaterThan(13.5);
    expect(r).toBeLessThan(15);
  });

  it("is below 25 % at €18,000 (Günstigerprüfung territory)", () => {
    expect(marginalRatePct(18_000)).toBeLessThan(25);
  });

  it("is above 25 % at €25,000 (typical salaries — keep the flat tax)", () => {
    expect(marginalRatePct(25_000)).toBeGreaterThan(25);
  });

  it("caps at 42 % above the second progression zone", () => {
    expect(marginalRatePct(70_000)).toBe(42);
    expect(marginalRatePct(200_000)).toBe(42);
  });

  it("is 45 % for the Reichensteuer bracket", () => {
    expect(marginalRatePct(300_000)).toBe(45);
  });

  it("JOINT uses Splitting — the rate at half the joint income", () => {
    expect(marginalRatePct(36_000, "JOINT")).toBe(marginalRatePct(18_000, "SINGLE"));
    expect(marginalRatePct(36_000, "JOINT")).toBeLessThan(25);
  });
});

describe("guenstigerpruefungRecommended", () => {
  it("recommends below the 25 % crossing, not above", () => {
    expect(guenstigerpruefungRecommended(15_000)).toBe(true);
    expect(guenstigerpruefungRecommended(65_000)).toBe(false);
  });

  it("is false when income is unknown or invalid (conservative default)", () => {
    expect(guenstigerpruefungRecommended(null)).toBe(false);
    expect(guenstigerpruefungRecommended(undefined)).toBe(false);
    expect(guenstigerpruefungRecommended(0)).toBe(false);
    expect(guenstigerpruefungRecommended(Number.NaN)).toBe(false);
  });

  it("respects joint filing (splitting doubles the worthwhile range)", () => {
    expect(guenstigerpruefungRecommended(38_000, "JOINT")).toBe(true);
    expect(guenstigerpruefungRecommended(38_000, "SINGLE")).toBe(false);
  });
});
