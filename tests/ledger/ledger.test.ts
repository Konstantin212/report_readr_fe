import { describe, expect, it } from "vitest";

import { buildLedgerSummary } from "@/lib/ledger/summary";
import type { NormalizedEvent } from "@/lib/domain/types";

describe("ledger summary", () => {
  it("rolls up positions, cash transfers, fees, income, and realized result", () => {
    const events: NormalizedEvent[] = [
      {
        id: "buy",
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
      },
      {
        id: "sell",
        broker: "INTERACTIVE_BROKERS",
        accountNumber: "U000000",
        type: "TRADE",
        date: "2024-08-01",
        currency: "USD",
        symbol: "VUAA",
        quantity: "-1",
        price: "100",
        proceeds: "100",
        realizedPnl: "19",
        fee: "1",
      },
      {
        id: "interest",
        broker: "INTERACTIVE_BROKERS",
        accountNumber: "U000000",
        type: "INTEREST",
        date: "2024-05-31",
        currency: "USD",
        amount: "3.5",
      },
      {
        id: "deposit",
        broker: "INTERACTIVE_BROKERS",
        accountNumber: "U000000",
        type: "CASH_TRANSFER",
        date: "2024-01-15",
        currency: "EUR",
        amount: "500",
      },
    ];

    const summary = buildLedgerSummary(events);

    expect(summary.positions).toEqual([
      { symbol: "VUAA", quantity: "1", currency: "USD" },
    ]);
    expect(summary.realizedPnl).toBe("19");
    expect(summary.income).toBe("3.5");
    expect(summary.fees).toBe("2");
    expect(summary.cashByCurrency).toEqual({ EUR: "500", USD: "-57.5" });
  });

  it("sorts retroactive imports chronologically and flags negative holdings for review", () => {
    const summary = buildLedgerSummary([
      {
        id: "sell-2024",
        broker: "INTERACTIVE_BROKERS",
        accountNumber: "U000000",
        type: "TRADE",
        date: "2024-08-01",
        currency: "USD",
        symbol: "VUAA",
        quantity: "-1",
        proceeds: "100",
        realizedPnl: "19",
        realizedPnlEur: "17",
      },
      {
        id: "buy-2023",
        broker: "INTERACTIVE_BROKERS",
        accountNumber: "U000000",
        type: "TRADE",
        date: "2023-11-01",
        currency: "USD",
        symbol: "VUAA",
        quantity: "2",
        amount: "-160",
        fee: "1",
      },
    ]);

    expect(summary.positions).toEqual([{ symbol: "VUAA", quantity: "1", currency: "USD" }]);
    expect(summary.realizedPnl).toBe("19");
    expect(summary.realizedPnlEur).toBe("17");
    expect(summary.reviewAlerts).toEqual([]);

    const sellOnlySummary = buildLedgerSummary([
      {
        id: "sell-2024",
        broker: "INTERACTIVE_BROKERS",
        accountNumber: "U000000",
        type: "TRADE",
        date: "2024-08-01",
        currency: "USD",
        symbol: "VUAA",
        quantity: "-1",
        proceeds: "100",
        realizedPnl: "19",
      },
    ]);

    expect(sellOnlySummary.positions).toEqual([{ symbol: "VUAA", quantity: "-1", currency: "USD" }]);
    expect(sellOnlySummary.reviewAlerts).toEqual([
      {
        eventId: "sell-2024",
        message: "Position for VUAA becomes negative after this event.",
      },
    ]);
  });
});
