import { describe, expect, it } from "vitest";

import { fmtEur, fmtNative, fmtPct, fmtPl, fmtPlNative, fmtQty } from "@/lib/format";

const PLUS = "+";
const MINUS = "−"; // Unicode minus, the one the UI renders
const ASCII_HYPHEN = "-";

/**
 * Issue #1: the P/L widgets are too narrow to spend a character on a sign,
 * so gains and losses are told apart by colour instead. The `fmtPl` family
 * must therefore never emit one; the `fmtEur` family still must, because it
 * formats uncoloured amounts (balances, costs, loss pots).
 */
describe("fmtPl — profit/loss magnitude, no sign", () => {
  it("formats a gain and the equal-and-opposite loss identically", () => {
    expect(fmtPl(1234.5)).toBe("€1.234,50");
    expect(fmtPl(-1234.5)).toBe("€1.234,50");
  });

  it("never emits a sign, for any magnitude", () => {
    for (const v of [-1e9, -1234.56, -0.01, -0, 0, 0.01, 1234.56, 1e9]) {
      const out = fmtPl(v);
      expect(out).not.toContain(PLUS);
      expect(out).not.toContain(MINUS);
      expect(out).not.toContain(ASCII_HYPHEN);
    }
  });

  it("honours dec and noSymbol", () => {
    expect(fmtPl(-1234.5, { dec: 0 })).toBe("€1.235");
    expect(fmtPl(-1234.5, { noSymbol: true })).toBe("1.234,50");
  });
});

describe("fmtPct — percentage magnitude, no sign", () => {
  it("drops the sign on both directions", () => {
    expect(fmtPct(12.34)).toBe("12.34%");
    expect(fmtPct(-12.34)).toBe("12.34%");
    expect(fmtPct(-1.25, 1)).toBe("1.3%");
  });

  it("still renders an em-dash for missing values", () => {
    expect(fmtPct(null)).toBe("—");
    expect(fmtPct(Number.NaN)).toBe("—");
    expect(fmtPct(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("fmtPlNative — foreign-currency P/L magnitude", () => {
  it("drops the sign but keeps the symbol", () => {
    expect(fmtPlNative(-1234.5, "USD")).toBe("$1.234,50");
    expect(fmtPlNative(1234.5, "USD")).toBe("$1.234,50");
  });

  it("falls back to a trailing code for unknown currencies", () => {
    expect(fmtPlNative(-10, "PLN")).toBe("10,00 PLN");
  });

  it("renders an em-dash without a value or currency", () => {
    expect(fmtPlNative(null, "USD")).toBe("—");
    expect(fmtPlNative(10, null)).toBe("—");
  });
});

describe("fmtEur / fmtNative — uncoloured amounts keep the minus", () => {
  it("keeps the minus so an uncoloured negative stays readable", () => {
    expect(fmtEur(-1234.5)).toBe(`${MINUS}€1.234,50`);
    expect(fmtEur(1234.5)).toBe("€1.234,50");
    expect(fmtNative(-1234.5, "USD")).toBe(`${MINUS}$1.234,50`);
  });

  it("never emits a plus on positives", () => {
    expect(fmtEur(1234.5)).not.toContain(PLUS);
    expect(fmtEur(0)).not.toContain(PLUS);
    expect(fmtNative(1234.5, "USD")).not.toContain(PLUS);
  });

  it("honours dec and noSymbol", () => {
    expect(fmtEur(-1234.5, { dec: 0, noSymbol: true })).toBe(`${MINUS}1.235`);
  });
});

describe("fmtQty", () => {
  it("strips trailing zeros without losing real decimals", () => {
    expect(fmtQty(0.05)).toBe("0.05");
    expect(fmtQty(0.00404612)).toBe("0.00404612");
    expect(fmtQty(0)).toBe("0");
  });
});
