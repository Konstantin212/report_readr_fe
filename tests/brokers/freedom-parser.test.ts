import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseBrokerStatement } from "@/lib/brokers";
import { mapFreedomInstrKind } from "@/lib/brokers/freedom";

describe("Freedom Finance statement parser", () => {
  it("extracts trades, dividends, fees, and account metadata from JSON", () => {
    const bytes = readFileSync("tests/fixtures/freedom.statement.sample.json");

    const parsed = parseBrokerStatement({
      broker: "FREEDOM_FINANCE",
      fileName: "freedom.json",
      bytes,
      taxYear: 2024,
    });

    expect(parsed.account.accountNumber).toBe("FF000000");
    expect(parsed.events.map((event) => event.type)).toEqual([
      "TRADE",
      "TRADE",
      "DIVIDEND",
      "FEE",
    ]);
    expect(parsed.events[1]).toMatchObject({
      symbol: "Apple Inc",
      isin: "US0378331005",
      quantity: "-1",
      realizedPnl: "29",
    });
  });

  it("keeps events outside the selected UI tax year for chronological ledger rebuilds", () => {
    const bytes = Buffer.from(
      JSON.stringify({
        date_start: "2023-01-01",
        date_end: "2024-12-31",
        plainAccountInfoData: {
          account: "FF000000",
          currency: "EUR",
        },
        trades: {
          detailed: [
            {
              date: "2023-11-01T10:00:00Z",
              instr_nm: "Apple Inc",
              isin: "US0378331005",
              operation: "Buy",
              curr_c: "USD",
              q: 2,
              p: 150,
              summ: -300,
              profit: 0,
              commission: 1,
              id: "trade-2023",
            },
            {
              date: "2024-09-01T10:00:00Z",
              instr_nm: "Apple Inc",
              isin: "US0378331005",
              operation: "Sell",
              curr_c: "USD",
              q: 1,
              p: 180,
              summ: 180,
              profit: 29,
              commission: 1,
              id: "trade-2024",
            },
          ],
        },
      }),
    );

    const parsed = parseBrokerStatement({
      broker: "FREEDOM_FINANCE",
      fileName: "freedom.json",
      bytes,
      taxYear: 2024,
    });

    expect(parsed.events.map((event) => event.date)).toEqual(["2023-11-01", "2024-09-01"]);
    expect(parsed.statementStartDate).toBe("2023-01-01");
    expect(parsed.statementEndDate).toBe("2024-12-31");
  });

  it("maps broker-declared instr_kind onto TRADE events", () => {
    const bytes = Buffer.from(
      JSON.stringify({
        date_start: "2024-01-01",
        date_end: "2024-12-31",
        plainAccountInfoData: { account: "FF000000", currency: "EUR" },
        trades: {
          detailed: [
            {
              date: "2024-03-01T10:00:00Z",
              instr_nm: "SCHD.US",
              isin: "US8085247976",
              operation: "Buy",
              curr_c: "USD",
              q: 10,
              p: 80,
              summ: -800,
              profit: 0,
              commission: 1,
              instr_kind: "фонд/ETF",
              id: "trade-etf",
            },
            {
              date: "2024-04-01T10:00:00Z",
              instr_nm: "Apple Inc",
              isin: "US0378331005",
              operation: "Buy",
              curr_c: "USD",
              q: 1,
              p: 150,
              summ: -150,
              profit: 0,
              commission: 1,
              instr_kind: "акция обыкновенная",
              id: "trade-stock",
            },
          ],
        },
      }),
    );

    const parsed = parseBrokerStatement({
      broker: "FREEDOM_FINANCE",
      fileName: "freedom.json",
      bytes,
      taxYear: 2024,
    });

    const trades = parsed.events.filter((e) => e.type === "TRADE");
    expect(trades[0].instrumentKind).toBe("etf");
    expect(trades[1].instrumentKind).toBe("stock");
  });
});

describe("mapFreedomInstrKind", () => {
  it.each([
    ["акция обыкновенная", "stock"],
    ["фонд/ETF", "etf"],
    ["депозитарная расписка", "stock"],
    ["облигация", "bond"],
    ["валюта", undefined],
    ["", undefined],
    [undefined, undefined],
  ] as const)("maps %j → %j", (raw, expected) => {
    expect(mapFreedomInstrKind(raw)).toBe(expected);
  });
});
