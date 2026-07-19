/**
 * Freedom24 reports each dividend TWICE — regression guard.
 *
 * Context: the 2025 reconciliation found FF dividends recorded once in
 * `cash_flows.detailed` as DIVIDEND (gross, €545.39) and again in
 * `corporate_actions.detailed` with `operation: "Dividends"` as
 * CORPORATE_ACTION carrying a monetary `amount` (net of withholding,
 * €487.91). The difference — €57.48 — matched the withholding total
 * (€57.46) almost exactly, proving they are the same payments restated net.
 *
 * The KAP builder only reads DIVIDEND rows, so tax output was never wrong,
 * but any consumer summing CORPORATE_ACTION amounts double-counts the year's
 * dividend income.
 *
 * Fix follows the precedent already set by parseSecuritiesInOuts: keep the
 * row as an audit trail, drop the monetary fields so nothing can sum it.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseBrokerStatement } from "@/lib/brokers";

function parse(json: unknown) {
  return parseBrokerStatement({
    broker: "FREEDOM_FINANCE",
    fileName: "freedom.json",
    bytes: Buffer.from(JSON.stringify(json)),
    taxYear: 2025,
  });
}

const base = JSON.parse(
  readFileSync("tests/fixtures/freedom.statement.sample.json", "utf8"),
);

describe("Freedom corporate-action dividend restatements", () => {
  const withDividendRestatement = {
    ...base,
    corporate_actions: {
      detailed: [
        {
          id: "ca-1",
          short_date: "2025-03-14",
          instr_nm: "ZIM",
          isin: "IL0065100930",
          operation: "Dividends",
          curr_c: "EUR",
          summ: 156.54,
        },
      ],
    },
  };

  it("keeps the corporate-action row for audit", () => {
    const parsed = parse(withDividendRestatement);
    const ca = parsed.events.filter((e) => e.type === "CORPORATE_ACTION");
    expect(ca).toHaveLength(1);
    expect(ca[0]).toMatchObject({ symbol: "ZIM", description: "Dividends" });
  });

  it("does NOT carry a monetary amount on a dividend restatement", () => {
    const parsed = parse(withDividendRestatement);
    const ca = parsed.events.find((e) => e.type === "CORPORATE_ACTION")!;
    // The dividend is already counted from cash_flows; this row must not
    // contribute money anywhere.
    expect(ca.amount).toBeUndefined();
    expect(ca.amountEur).toBeUndefined();
    expect(ca.cashAmount).toBeUndefined();
  });

  it("still carries amounts for NON-dividend corporate actions", () => {
    // A cash-in-lieu or merger consideration is real money and must survive.
    const parsed = parse({
      ...base,
      corporate_actions: {
        detailed: [
          {
            id: "ca-2",
            short_date: "2025-05-02",
            instr_nm: "ZETA",
            isin: "US98956A1051",
            operation: "Cash in lieu",
            curr_c: "EUR",
            summ: 12.5,
          },
        ],
      },
    });
    const ca = parsed.events.find((e) => e.type === "CORPORATE_ACTION")!;
    expect(ca.amount).toBe("12.5");
  });
});
