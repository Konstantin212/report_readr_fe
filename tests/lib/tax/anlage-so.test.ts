import { describe, expect, it } from "vitest";

import { FREIGRENZE_EUR } from "@/lib/tax/anlage-so";

/**
 * The Freigrenze in §22 Nr. 3 EStG is a cliff: strictly below €256 the
 * whole sum is tax-free; at or above, the full sum becomes taxable.
 * Encoding this constant + the threshold logic separately makes the
 * accidental "off-by-one to allowance" mistake hard to ship.
 */
describe("Anlage SO Freigrenze threshold", () => {
  it("is exactly €256 (§22 Nr. 3 EStG)", () => {
    expect(FREIGRENZE_EUR).toBe(256);
  });

  it("treats €255.99 as below (tax-free)", () => {
    const total = 255.99;
    const reached = total >= FREIGRENZE_EUR;
    expect(reached).toBe(false);
  });

  it("treats exactly €256 as reached (taxable in full)", () => {
    const total = 256;
    const reached = total >= FREIGRENZE_EUR;
    expect(reached).toBe(true);
  });

  it("treats €256.01 as above (taxable in full)", () => {
    const total = 256.01;
    const reached = total >= FREIGRENZE_EUR;
    expect(reached).toBe(true);
  });
});
