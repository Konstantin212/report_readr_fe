import { describe, it, expect } from "vitest";
import {
  KAP_FIELDS,
  fieldFor,
  containedChildren,
  ALL_ELSTER_FIELDS,
} from "@/lib/tax/elster-fields";

describe("ELSTER field registry", () => {
  it("carries the verbatim caption for Zeile 19", () => {
    expect(fieldFor("KAP_Z19").caption).toBe(
      "Ausländische Kapitalerträge (ohne Beträge laut den Zeilen 26a und 52)",
    );
  });

  it("marks Zeile 19 as signed — a losing year is a negative total", () => {
    expect(fieldFor("KAP_Z19").sign).toBe("signed");
  });

  it("marks the breakout lines as non-negative magnitudes", () => {
    for (const k of ["KAP_Z20", "KAP_Z22", "KAP_Z23"] as const) {
      expect(fieldFor(k).sign).toBe("magnitude");
    }
  });

  it("knows 20/22/23 are contained in 19 (the form says 'darin enthaltene')", () => {
    expect(containedChildren("KAP_Z19").sort()).toEqual(
      ["KAP_Z20", "KAP_Z22", "KAP_Z23"].sort(),
    );
  });

  it("uses euro+cent precision for the tax-credit lines, whole euros for income", () => {
    expect(fieldFor("KAP_Z19").precision).toBe("whole_euro");
    expect(fieldFor("KAP_Z37").precision).toBe("euro_cent");
    expect(fieldFor("KAP_Z41").precision).toBe("euro_cent");
  });

  it("places Zeile 41 in section 8 — NOT 51/52, which are family-foundation fields", () => {
    const z41 = fieldFor("KAP_Z41");
    expect(z41.section).toBe(8);
    expect(z41.zeile).toBe("41");
    expect(z41.caption).toBe("Anrechenbare noch nicht angerechnete ausländische Steuern");
    expect(KAP_FIELDS.some((f) => f.zeile === "51" || f.zeile === "52")).toBe(false);
  });

  it("has no duplicate keys", () => {
    const keys = ALL_ELSTER_FIELDS.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
