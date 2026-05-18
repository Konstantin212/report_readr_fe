import { describe, expect, it } from "vitest";

import { toTransactionInsert } from "@/lib/imports/persistence";
import type { NormalizedEvent } from "@/lib/domain/types";

describe("import persistence mapping", () => {
  it("maps normalized events into owner-scoped transaction inserts", () => {
    const event: NormalizedEvent = {
      id: "trade-1",
      broker: "INTERACTIVE_BROKERS",
      accountNumber: "U000000",
      type: "TRADE",
      date: "2024-02-01",
      currency: "USD",
      symbol: "VUAA",
      quantity: "2",
      price: "80",
      amount: "-160",
      fee: "1",
    };

    expect(
      toTransactionInsert({
        event,
        ownerUserId: "user-1",
        importId: "11111111-1111-1111-1111-111111111111",
        brokerAccountId: "22222222-2222-2222-2222-222222222222",
      }),
    ).toMatchObject({
      ownerUserId: "user-1",
      broker: "INTERACTIVE_BROKERS",
      accountNumber: "U000000",
      eventFingerprint: expect.any(String),
      eventType: "TRADE",
      eventDate: "2024-02-01",
      currency: "USD",
      symbol: "VUAA",
      quantity: "2",
      fee: "1",
      requiresReview: false,
    });
  });
});
