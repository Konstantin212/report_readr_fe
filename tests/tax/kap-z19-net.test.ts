/**
 * Zeile 19 is the NET foreign capital-income total: gains AND losses are
 * "darin enthalten". Emitting it gross is what made a real 2025 filing
 * over-declare EUR 3.611 of income.
 */
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { buildKapAndKapInv } from "@/lib/tax/german-tax";
import { containedChildren } from "@/lib/tax/elster-fields";
import { buildInputs, dividend, interest, match, ACCT } from "./kap-fixtures";

const STOCK = { kind: "stock" as const, subtype: null };

function draftFor() {
  return buildKapAndKapInv(
    buildInputs(
      [
        dividend({ brokerAccountId: ACCT.ff, symbol: "GM", amountEur: "297.73" }),
        interest({ brokerAccountId: ACCT.ibkr, amountEur: "33.30" }),
      ],
      [
        match({ brokerAccountId: ACCT.ff, symbol: "META", gainEur: "585.53" }),
        match({ brokerAccountId: ACCT.ff, symbol: "ENPH", gainEur: "-2228.45" }),
        match({ brokerAccountId: ACCT.ibkr, symbol: "BOND", gainEur: "-86.52" }),
      ],
      { GM: STOCK, META: STOCK, ENPH: STOCK, BOND: { kind: "bond", subtype: null } },
    ),
  );
}

describe("Anlage KAP Zeile 19 — net, not gross", () => {
  it("subtracts the contained losses from the Zeile 19 total", () => {
    // 297.73 + 33.30 + 585.53 - 2228.45 - 86.52
    expect(draftFor().kap.lines.Z19.cents).toBe("-1398.41");
    expect(draftFor().kap.lines.Z19.euros).toBe(-1398);
  });

  it("still reports the breakouts as positive magnitudes", () => {
    const d = draftFor();
    expect(d.kap.lines.Z20.cents).toBe("585.53");
    expect(d.kap.lines.Z23.cents).toBe("2228.45");
    expect(d.kap.lines.Z22.cents).toBe("86.52");
  });

  it("holds the containment invariant: parent + contained magnitudes reconcile", () => {
    const d = draftFor();
    const children = containedChildren("KAP_Z19");
    expect(children).toHaveLength(3);
    // Z19 + Z22 + Z23 - Z20 == the non-disposal income (dividends + interest)
    const rebuilt = new Decimal(d.kap.lines.Z19.cents)
      .plus(d.kap.lines.Z22.cents)
      .plus(d.kap.lines.Z23.cents)
      .minus(d.kap.lines.Z20.cents);
    expect(rebuilt.toFixed(2)).toBe("331.03");
  });

  it("keeps Zeile 19 positive when there are no losses", () => {
    const d = buildKapAndKapInv(
      buildInputs([dividend({ brokerAccountId: ACCT.ff, symbol: "GM", amountEur: "100.00" })], [], {
        GM: STOCK,
      }),
    );
    expect(d.kap.lines.Z19.cents).toBe("100.00");
  });
});
