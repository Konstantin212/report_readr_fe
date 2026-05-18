import { describe, expect, it } from "vitest";

import type { NormalizedEvent } from "@/lib/domain/types";
import { applyManualReviewValues, toTransactionInsert } from "@/lib/imports/persistence";

describe("transaction review persistence mapping", () => {
  it("stores canonical cash and manual review metadata", () => {
    const event: NormalizedEvent = {
      id: "trade-1",
      broker: "INTERACTIVE_BROKERS",
      accountNumber: "U000000",
      type: "TRADE",
      date: "2024-02-01",
      currency: "USD",
      symbol: "AAPL",
      quantity: "-1",
      proceeds: "120",
      cashAmount: "119",
      cashAmountEur: "109.5",
      realizedPnl: "20",
      realizedPnlEur: "18",
      fxSource: "MANUAL_REVIEW",
      reviewedAt: "2026-05-16T12:00:00.000Z",
      reviewedByUserId: "user-1",
      reviewNote: "Reviewed against broker tax report.",
    };

    expect(
      toTransactionInsert({
        event,
        ownerUserId: "user-1",
        importId: "11111111-1111-1111-1111-111111111111",
        brokerAccountId: "22222222-2222-2222-2222-222222222222",
      }),
    ).toMatchObject({
      cashAmount: "119",
      cashAmountEur: "109.5",
      realizedPnlEur: "18",
      fxSource: "MANUAL_REVIEW",
      reviewedAt: new Date("2026-05-16T12:00:00.000Z"),
      reviewedByUserId: "user-1",
      reviewNote: "Reviewed against broker tax report.",
      requiresReview: false,
    });
  });

  it("builds an owner-scoped manual review update and clears the review flag", () => {
    expect(
      applyManualReviewValues({
        ownerUserId: "user-1",
        transactionId: "tx-1",
        reviewerUserId: "user-1",
        values: {
          amountEur: "9.1",
          withholdingTaxEur: "1.2",
          reviewNote: "Manual EUR values from broker report",
        },
        reviewedAt: new Date("2026-05-16T12:00:00.000Z"),
      }),
    ).toEqual({
      ownerUserId: "user-1",
      transactionId: "tx-1",
      set: {
        amountEur: "9.1",
        withholdingTaxEur: "1.2",
        realizedPnlEur: undefined,
        feeEur: undefined,
        cashAmountEur: undefined,
        fxSource: "MANUAL_REVIEW",
        requiresReview: false,
        reviewedAt: new Date("2026-05-16T12:00:00.000Z"),
        reviewedByUserId: "user-1",
        reviewNote: "Manual EUR values from broker report",
      },
    });
  });
});
