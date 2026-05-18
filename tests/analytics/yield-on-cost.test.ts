import { describe, expect, it } from "vitest";
import { yieldOnCost } from "@/lib/analytics/yield-on-cost";

describe("yieldOnCost", () => {
  it("1000 / 50000 → 0.02", () => {
    expect(yieldOnCost(1000, 50000)).toBeCloseTo(0.02);
  });
  it("0 / 1000 → 0", () => {
    expect(yieldOnCost(0, 1000)).toBe(0);
  });
  it("100 / 0 → 0 (guard against division by zero)", () => {
    expect(yieldOnCost(100, 0)).toBe(0);
  });
});
