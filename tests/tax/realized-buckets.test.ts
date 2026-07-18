/**
 * §20 Abs. 6 EStG realized-gain bucket split.
 *
 * Two statutory pots that CANNOT offset each other:
 *  - "Aktien"   — gains/losses from selling individual shares. Losses here may
 *                 only offset share GAINS (S. 4); the rest becomes a
 *                 Verlustvortrag. They can never reduce ETF gains, dividends
 *                 or interest.
 *  - "Sonstige" — everything else (funds/ETFs, bonds, …), which shares the
 *                 general pot with dividends and interest.
 *
 * Classification MUST be ISIN-first: the real portfolio holds Citigroup common
 * stock (US1729674242) and a Citigroup BOND (US172967MZ11) both under ticker
 * "C". Symbol-only classification put the bond's −€86.52 in the Aktien bucket;
 * ELSTER booked it as "other capital losses €87" (Sonstige). That single
 * misclassification distorted the 2025 share-loss carryforward.
 */
import { describe, it, expect } from "vitest";
import { splitRealizedByBucket } from "@/lib/tax/realized-buckets";

const m = (symbol: string, gainEur: number, isin?: string) => ({ symbol, isin, gainEur: String(gainEur) });

// ISIN-first classification map, as built by toClassificationRecord().
const classification = {
  US1729674242: { kind: "stock" as const, subtype: null },
  US172967MZ11: { kind: "bond" as const, subtype: null },
  US8085247976: { kind: "etf" as const, subtype: "aktien" as const },
};

describe("splitRealizedByBucket", () => {
  it("puts a bond in Sonstige even when its ticker collides with a stock", () => {
    const out = splitRealizedByBucket([m("C", -86.52, "US172967MZ11")], classification);
    expect(out.aktien.net).toBe(0);
    expect(out.sonstige.net).toBeCloseTo(-86.52, 2);
  });

  it("puts the same-ticker common stock in Aktien", () => {
    const out = splitRealizedByBucket([m("C", -86.52, "US1729674242")], classification);
    expect(out.aktien.net).toBeCloseTo(-86.52, 2);
    expect(out.sonstige.net).toBe(0);
  });

  it("puts an ETF in Sonstige", () => {
    const out = splitRealizedByBucket([m("SCHD", 55.1, "US8085247976")], classification);
    expect(out.sonstige.net).toBeCloseTo(55.1, 2);
    expect(out.aktien.net).toBe(0);
  });

  it("accumulates gains and losses separately per bucket", () => {
    const out = splitRealizedByBucket(
      [m("META", 404.42, "US30303M1027"), m("ENPH", -1540.22, "US29355A1079")],
      { US30303M1027: { kind: "stock", subtype: null }, US29355A1079: { kind: "stock", subtype: null } },
    );
    expect(out.aktien.gains).toBeCloseTo(404.42, 2);
    expect(out.aktien.losses).toBeCloseTo(-1540.22, 2);
    expect(out.aktien.net).toBeCloseTo(-1135.8, 2);
  });

  it("falls back to symbol classification when the ISIN is unknown", () => {
    // No ISIN and no override → hardcoded maps decide. SPY is a known ETF.
    const out = splitRealizedByBucket([m("SPY", 10)], undefined);
    expect(out.sonstige.net).toBeCloseTo(10, 2);
  });
});
