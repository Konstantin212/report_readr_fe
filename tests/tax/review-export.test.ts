import { describe, expect, it } from "vitest";

import type { NormalizedEvent } from "@/lib/domain/types";
import { buildGermanTaxDraft } from "@/lib/tax/german-tax";
import { buildTaxEvidenceCsv, buildTaxEvidenceJson } from "@/lib/tax/export";

describe("tax review and export behavior", () => {
  it("includes manually reviewed EUR values and keeps unresolved events out of filing totals", () => {
    const draft = buildGermanTaxDraft({
      taxYear: 2024,
      events: [
        {
          id: "reviewed-gain",
          broker: "INTERACTIVE_BROKERS",
          accountNumber: "U000000",
          type: "TRADE",
          date: "2024-04-01",
          currency: "USD",
          symbol: "AAPL",
          realizedPnl: "20",
          realizedPnlEur: "18.3",
          fxSource: "MANUAL_REVIEW",
          reviewedAt: "2026-05-16T10:00:00.000Z",
          reviewedByUserId: "user-1",
          reviewNote: "IBKR annual report EUR amount",
          requiresReview: false,
        },
        {
          id: "unresolved-dividend",
          broker: "INTERACTIVE_BROKERS",
          accountNumber: "U000000",
          type: "DIVIDEND",
          date: "2024-05-01",
          currency: "USD",
          amount: "10",
          requiresReview: true,
        },
      ],
    });

    expect(draft.lines.capitalIncome).toBe("18.3");
    expect(draft.reviewItems).toEqual([
      {
        eventId: "unresolved-dividend",
        message: "Missing reviewed EUR tax value for DIVIDEND on 2024-05-01.",
      },
    ]);
    expect(draft.filingReady).toBe(false);
  });

  it("exports tax evidence as CSV and JSON without storing raw broker files", () => {
    const events: NormalizedEvent[] = [
      {
        id: "interest",
        broker: "FREEDOM_FINANCE",
        accountNumber: "FF000000",
        type: "INTEREST",
        date: "2024-02-01",
        currency: "EUR",
        amount: "5",
        amountEur: "5",
      },
    ];
    const draft = buildGermanTaxDraft({ taxYear: 2024, events });

    expect(buildTaxEvidenceCsv(draft)).toContain("line,date,broker,accountNumber,type,symbol,isin,currency,amount");
    expect(buildTaxEvidenceCsv(draft)).toContain("capitalIncome,2024-02-01,FREEDOM_FINANCE,FF000000,INTEREST,,,EUR,5");
    expect(buildTaxEvidenceJson(draft)).toEqual({
      taxYear: 2024,
      filingReady: true,
      lines: draft.lines,
      reviewItems: [],
      evidence: draft.evidence,
    });
  });
});
