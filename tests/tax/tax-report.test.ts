import { describe, expect, it } from "vitest";

import { buildGermanTaxDraft } from "@/lib/tax/german-tax";
import type { NormalizedEvent } from "@/lib/domain/types";

describe("German Anlage KAP draft", () => {
  it("aggregates income, realized gains, losses, and withholding evidence", () => {
    const events: NormalizedEvent[] = [
      {
        id: "dividend",
        broker: "FREEDOM_FINANCE",
        accountNumber: "FF000000",
        type: "DIVIDEND",
        date: "2024-05-10",
        currency: "USD",
        amount: "10",
        withholdingTax: "1.5",
      },
      {
        id: "gain",
        broker: "INTERACTIVE_BROKERS",
        accountNumber: "U000000",
        type: "TRADE",
        date: "2024-08-01",
        currency: "USD",
        symbol: "VUAA",
        quantity: "-1",
        realizedPnl: "19",
      },
      {
        id: "loss",
        broker: "INTERACTIVE_BROKERS",
        accountNumber: "U000000",
        type: "TRADE",
        date: "2024-10-01",
        currency: "USD",
        symbol: "ENPH",
        quantity: "-1",
        realizedPnl: "-4",
      },
    ];

    const draft = buildGermanTaxDraft({ taxYear: 2024, events });

    expect(draft.lines.capitalIncome).toBe("29");
    expect(draft.lines.stockLosses).toBe("4");
    expect(draft.lines.foreignWithholdingTax).toBe("1.5");
    expect(draft.evidence).toHaveLength(3);
  });

  it("uses EUR tax values and excludes review-needed events from line totals", () => {
    const draft = buildGermanTaxDraft({
      taxYear: 2024,
      events: [
        {
          id: "eur-dividend",
          broker: "FREEDOM_FINANCE",
          accountNumber: "FF000000",
          type: "DIVIDEND",
          date: "2024-05-10",
          currency: "USD",
          amount: "10",
          amountEur: "9",
          withholdingTax: "1.5",
          withholdingTaxEur: "1.35",
        },
        {
          id: "review-gain",
          broker: "INTERACTIVE_BROKERS",
          accountNumber: "U000000",
          type: "TRADE",
          date: "2024-08-01",
          currency: "USD",
          symbol: "VUAA",
          realizedPnl: "19",
          requiresReview: true,
        },
      ],
    });

    expect(draft.lines.capitalIncome).toBe("9");
    expect(draft.lines.foreignWithholdingTax).toBe("1.35");
    expect(draft.reviewItems).toEqual([
      {
        eventId: "review-gain",
        message: "Missing reviewed EUR tax value for TRADE on 2024-08-01.",
      },
    ]);
  });
});
