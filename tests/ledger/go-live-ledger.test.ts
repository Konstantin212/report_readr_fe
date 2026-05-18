import { describe, expect, it } from "vitest";

import type { NormalizedEvent } from "@/lib/domain/types";
import { buildLedgerSummary } from "@/lib/ledger/summary";

describe("go-live ledger behavior", () => {
  it("uses canonical signed cash fields before broker-specific amount fallbacks", () => {
    const events: NormalizedEvent[] = [
      {
        id: "buy",
        broker: "INTERACTIVE_BROKERS",
        accountNumber: "U000000",
        type: "TRADE",
        date: "2024-01-10",
        currency: "USD",
        symbol: "AAPL",
        quantity: "1",
        amount: "9999",
        fee: "9999",
        cashAmount: "-101.25",
        cashAmountEur: "-93.5",
      },
      {
        id: "dividend",
        broker: "INTERACTIVE_BROKERS",
        accountNumber: "U000000",
        type: "DIVIDEND",
        date: "2024-06-10",
        currency: "USD",
        amount: "9999",
        withholdingTax: "9999",
        cashAmount: "8.5",
        cashAmountEur: "7.8",
        amountEur: "9",
      },
    ];

    const summary = buildLedgerSummary(events);

    expect(summary.cashByCurrency).toEqual({ USD: "-92.75" });
    expect(summary.cashByCurrencyEur).toBe("-85.7");
    expect(summary.incomeEur).toBe("9");
  });

  it("keeps position snapshots as reconciliation evidence instead of replacing historical quantity", () => {
    const events: NormalizedEvent[] = [
      {
        id: "buy",
        broker: "INTERACTIVE_BROKERS",
        accountNumber: "U000000",
        type: "TRADE",
        date: "2024-01-10",
        currency: "USD",
        symbol: "AAPL",
        quantity: "3",
      },
      {
        id: "snapshot",
        broker: "INTERACTIVE_BROKERS",
        accountNumber: "U000000",
        type: "POSITION_SNAPSHOT",
        date: "2024-12-31",
        currency: "USD",
        symbol: "AAPL",
        quantity: "1",
      },
    ];

    const summary = buildLedgerSummary(events);

    expect(summary.positions).toEqual([{ symbol: "AAPL", quantity: "3", currency: "USD" }]);
    expect(summary.reviewAlerts).toEqual([
      {
        eventId: "snapshot",
        message: "Position snapshot for AAPL reports 1 while the event ledger calculates 3.",
      },
    ]);
  });
});
