import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseBrokerStatement } from "@/lib/brokers";

describe("Interactive Brokers statement parser", () => {
  it("extracts account metadata and normalized events from an activity CSV", () => {
    const bytes = readFileSync("tests/fixtures/ibkr-activity.sample.csv");

    const parsed = parseBrokerStatement({
      broker: "INTERACTIVE_BROKERS",
      fileName: "ibkr.csv",
      bytes,
      taxYear: 2024,
    });

    expect(parsed.account.accountNumber).toBe("U000000");
    expect(parsed.account.baseCurrency).toBe("EUR");
    expect(parsed.events.map((event) => event.type)).toEqual([
      "TRADE",
      "TRADE",
      "INTEREST",
      "FEE",
      "CASH_TRANSFER",
    ]);
    expect(parsed.events[1]).toMatchObject({
      type: "TRADE",
      symbol: "VUAA",
      quantity: "-1",
      proceeds: "100",
      realizedPnl: "19",
    });
  });

  it("keeps dated events outside the selected UI tax year for chronological ledger rebuilds", () => {
    const bytes = Buffer.from(`Statement,Header,Field Name,Field Value
Statement,Data,BrokerName,Interactive Brokers Ireland Limited
Statement,Data,Period,"January 1, 2023 - December 31, 2024"
Account Information,Header,Field Name,Field Value
Account Information,Data,Account,U000000
Account Information,Data,Base Currency,EUR
Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code
Trades,Data,Order,Stocks,USD,VUAA,2023-11-01;10:00:00,2,80,-160,-1,160,0,0,O
Trades,Data,Order,Stocks,USD,VUAA,2024-08-01;10:00:00,-1,100,100,-1,80,19,19,C
`);

    const parsed = parseBrokerStatement({
      broker: "INTERACTIVE_BROKERS",
      fileName: "ibkr.csv",
      bytes,
      taxYear: 2024,
    });

    expect(parsed.events.map((event) => event.date)).toEqual(["2023-11-01", "2024-08-01"]);
    expect(parsed.statementStartDate).toBe("2023-01-01");
    expect(parsed.statementEndDate).toBe("2024-12-31");
  });
});
