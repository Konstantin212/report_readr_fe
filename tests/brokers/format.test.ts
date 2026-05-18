import { describe, expect, it } from "vitest";

import { isInTaxYear } from "@/lib/brokers/format";

describe("broker format helpers", () => {
  it("treats missing aggregate-row dates as outside the tax year", () => {
    expect(isInTaxYear(undefined, 2024)).toBe(false);
    expect(isInTaxYear("", 2024)).toBe(false);
    expect(isInTaxYear("2024-05-31", 2024)).toBe(true);
  });
});
