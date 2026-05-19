import { describe, it, expect } from "vitest";
import { parseFreedomFinanceStatement } from "@/lib/brokers/freedom";

/**
 * Comprehensive Freedom24 market-scenario coverage. Each `it` synthesises a
 * minimal but realistic chunk of a Freedom24 JSON export, runs the parser,
 * and asserts on the resulting NormalizedEvent[]. Together they exercise
 * every event type, every cash-flow taxonomy code, every corporate-action
 * shape, and every shape difference between the legacy and post-rebrand
 * report layouts.
 */

function bytes(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj));
}

const ACCOUNT = { plainAccountInfoData: { account: "FF000123", currency: "USD" } };
const PERIOD = { date_start: "2024-01-01", date_end: "2024-12-31" };

describe("Freedom24 — trades", () => {
  it("emits a BUY TRADE with positive quantity and signed cashAmount net of commission", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      trades: { detailed: [{
        id: "t1", short_date: "2024-03-04", instr_nm: "BNTX.US", isin: "US09075V1026",
        operation: "buy", curr_c: "USD", q: 5, p: 100, summ: -500, commission: 2, profit: 0,
      }]},
    }), 2024);
    const t = r.events[0];
    expect(t.type).toBe("TRADE");
    expect(t.symbol).toBe("BNTX.US");
    expect(t.quantity).toBe("5");
    expect(t.amount).toBe("-500");
    expect(t.cashAmount).toBe("-502"); // -500 - 2 fee
    expect(t.fee).toBe("2");
  });

  it("emits a SELL TRADE with negative quantity and realizedPnl carried through", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      trades: { detailed: [{
        id: "t2", short_date: "2024-08-12", instr_nm: "AAPL.US", isin: "US0378331005",
        operation: "sell", curr_c: "USD", q: 3, p: 200, summ: 600, commission: 1.5, profit: 80,
      }]},
    }), 2024);
    const t = r.events[0];
    expect(t.type).toBe("TRADE");
    expect(t.quantity).toBe("-3");      // signed negative for sell
    expect(t.realizedPnl).toBe("80");
    expect(t.cashAmount).toBe("598.5"); // 600 - 1.5 fee
  });

  it("flags non-EUR trades with realized P&L for FX review", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      trades: { detailed: [{
        short_date: "2024-08-12", instr_nm: "MSFT.US", operation: "sell",
        curr_c: "USD", q: 1, p: 400, summ: 400, profit: 50, commission: 0,
      }]},
    }), 2024);
    expect(r.events[0].requiresReview).toBe(true);
    expect(r.events[0].fxSource).toBe("MISSING");
  });

  it("EUR trades skip the FX review flag and copy amount → amountEur", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      trades: { detailed: [{
        short_date: "2024-08-12", instr_nm: "SPYW.DE", operation: "buy",
        curr_c: "EUR", q: 10, p: 25, summ: -250, profit: 0, commission: 1,
      }]},
    }), 2024);
    expect(r.events[0].requiresReview).toBeUndefined();
    expect(r.events[0].amountEur).toBe("-250");
    expect(r.events[0].fxSource).toBe("BROKER");
  });
});

describe("Freedom24 — cash_in_outs (the new per-transaction array)", () => {
  it("CARD deposit becomes a CASH_TRANSFER with positive amount", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      cash_in_outs: [{
        id: 1, currency: "USD", type: "card", datetime: "2024-02-01 12:00:00",
        amount: "500", commission: "0", comment: "Card payment",
      }],
    }), 2024);
    const e = r.events.find(x => x.source === "cash_in_outs")!;
    expect(e.type).toBe("CASH_TRANSFER");
    expect(e.amount).toBe("500");
    expect(e.cashAmount).toBe("500");
  });

  it("BANK withdrawal becomes a CASH_TRANSFER with the broker's signed amount", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      cash_in_outs: [{
        currency: "EUR", type: "bank", datetime: "2024-07-15 09:00:00",
        amount: "-1000", comment: "Bank transfer out",
      }],
    }), 2024);
    const e = r.events[0];
    expect(e.type).toBe("CASH_TRANSFER");
    expect(e.amount).toBe("-1000");
    expect(e.currency).toBe("EUR");
  });

  it("DIVIDEND row produces a DIVIDEND event keyed by ticker", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      cash_in_outs: [{
        currency: "USD", type: "dividend", datetime: "2024-03-15 16:00:00",
        amount: "42.50", ticker: "AAPL.US", comment: "Cash dividend",
      }],
    }), 2024);
    const e = r.events[0];
    expect(e.type).toBe("DIVIDEND");
    expect(e.symbol).toBe("AAPL.US");
    expect(e.amount).toBe("42.5");
  });

  it("TAX row becomes a WITHHOLDING_TAX event with the same absolute amount", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      cash_in_outs: [{
        currency: "USD", type: "tax", datetime: "2024-03-15 16:00:01",
        amount: "-6.38", ticker: "AAPL.US", comment: "Withholding tax 15%",
      }],
    }), 2024);
    const e = r.events[0];
    expect(e.type).toBe("WITHHOLDING_TAX");
    expect(e.withholdingTax).toBe("6.38");
    expect(e.amount).toBe("-6.38");
  });

  it("DIVIDEND_REVERTED flips the sign so the cash math nets to zero with the original dividend", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      cash_in_outs: [
        { currency: "USD", type: "dividend", datetime: "2024-03-15 16:00:00", amount: "42.50", ticker: "AAPL.US" },
        { currency: "USD", type: "dividend_reverted", datetime: "2024-03-16 09:00:00", amount: "42.50", ticker: "AAPL.US" },
      ],
    }), 2024);
    expect(r.events[0].cashAmount).toBe("42.5");
    expect(r.events[1].cashAmount).toBe("-42.5");
  });

  it("block_commission / unblock_commission becomes a FEE event", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      cash_in_outs: [
        { currency: "USD", type: "block_commission", datetime: "2024-06-01 10:00:00", amount: "-0.30" },
        { currency: "USD", type: "unblock_commission", datetime: "2024-06-15 10:00:00", amount: "-0.30" },
      ],
    }), 2024);
    expect(r.events.map(e => e.type)).toEqual(["FEE", "FEE"]);
  });

  it("drops rows with sentinel non-date values like 'Grouped'", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      cash_in_outs: [
        { currency: "USD", type: "card", datetime: "Grouped", amount: "500" },
        { currency: "USD", type: "dividend", datetime: "2024-04-01 16:00:00", amount: "10", ticker: "AAPL.US" },
      ],
    }), 2024);
    expect(r.events.length).toBe(1);
    expect(r.events[0].type).toBe("DIVIDEND");
  });

  it("supports a USD report intermixed with EUR rows (multi-currency portfolio)", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      cash_in_outs: [
        { currency: "USD", type: "card", datetime: "2024-02-01 12:00:00", amount: "500" },
        { currency: "EUR", type: "bank", datetime: "2024-02-02 12:00:00", amount: "300" },
      ],
    }), 2024);
    expect(r.events.map(e => e.currency).sort()).toEqual(["EUR", "USD"]);
  });
});

describe("Freedom24 — securities_in_outs (corporate actions, new array)", () => {
  it("a stock split shows up as CORPORATE_ACTION with negative-quantity delta", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      securities_in_outs: [{
        ticker: "SCHD.US", type: "split", datetime: "2024-10-11 15:00:00",
        quantity: "-34.00000000", balance_currency: "USD",
        market_value: "-962.20", comment: "Stock split SCHD.US factor 1/3",
      }],
    }), 2024);
    const e = r.events[0];
    expect(e.type).toBe("CORPORATE_ACTION");
    expect(e.symbol).toBe("SCHD.US");
    expect(e.quantity).toBe("-34");
    expect(e.description).toMatch(/split/i);
  });

  it("a share transfer-in surfaces with a positive quantity", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      securities_in_outs: [{
        ticker: "C.US", type: "transfer_in", datetime: "2024-04-01 10:00:00",
        quantity: "24", balance_currency: "USD",
      }],
    }), 2024);
    expect(r.events[0].quantity).toBe("24");
    expect(r.events[0].symbol).toBe("C.US");
  });
});

describe("Freedom24 — full multi-event scenario", () => {
  it("processes a realistic mix of trade, dividend, tax, deposit, split, and commission together", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      trades: { detailed: [
        { id: "t1", short_date: "2024-01-15", instr_nm: "AAPL.US", isin: "US0378331005",
          operation: "buy", curr_c: "USD", q: 10, p: 180, summ: -1800, commission: 1, profit: 0 },
      ]},
      cash_in_outs: [
        { currency: "USD", type: "card", datetime: "2024-01-10 09:00:00", amount: "2000" },
        { currency: "USD", type: "dividend", datetime: "2024-03-15 16:00:00", amount: "8.50", ticker: "AAPL.US" },
        { currency: "USD", type: "tax", datetime: "2024-03-15 16:00:01", amount: "-1.28", ticker: "AAPL.US" },
        { currency: "USD", type: "block_commission", datetime: "2024-06-01 10:00:00", amount: "-0.30" },
      ],
      securities_in_outs: [
        { ticker: "AAPL.US", type: "split", datetime: "2024-08-29 16:00:00", quantity: "30", balance_currency: "USD" },
      ],
    }), 2024);

    const byType = r.events.reduce<Record<string, number>>((acc, e) => {
      acc[e.type] = (acc[e.type] ?? 0) + 1;
      return acc;
    }, {});
    expect(byType.TRADE).toBe(1);
    expect(byType.CASH_TRANSFER).toBe(1);
    expect(byType.DIVIDEND).toBe(1);
    expect(byType.WITHHOLDING_TAX).toBe(1);
    expect(byType.FEE).toBe(1);
    expect(byType.CORPORATE_ACTION).toBe(1);
    expect(r.events.every(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date))).toBe(true);
  });
});

describe("Freedom24 — defensive cases", () => {
  it("a fully-grouped report (every row is 'Grouped') yields zero non-trade events but doesn't throw", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      cash_flows: { detailed: [{ date: "Grouped", curr_c: "USD", summ: 100, operation: "Card payment" }] },
      commissions: { detailed: [{ datetime: "Grouped", currency: "USD", sum: 5, type: "Trading fee" }] },
      corporate_actions: { detailed: [{ date: "Grouped", currency: "USD", ticker: "Grouped", type: "Dividends", amount: 10 }] },
    }), 2024);
    expect(r.events.length).toBe(0);
  });

  it("legacy (pre-2024) Freedom Finance JSON still parses via the *.detailed paths", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      date_start: "2023-01-01", date_end: "2023-12-31",
      plainAccountInfoData: { account: "FF-LEGACY", currency: "USD" },
      cash_flows: { detailed: [{
        id: "cf-1", short_date: "2023-05-15", instr_nm: "JNJ", operation: "Dividend",
        curr_c: "USD", summ: 25, withholding_tax: 3.75,
      }]},
      commissions: { detailed: [{
        id: "cm-1", short_date: "2023-05-31", curr_c: "USD", summ: -5,
      }]},
      corporate_actions: { detailed: [{
        id: "ca-1", short_date: "2023-08-25", instr_nm: "WMT", isin: "US9311421039",
        operation: "Split", curr_c: "USD", q: 2,
      }]},
    }), 2023);
    expect(r.events.map(e => e.type).sort()).toEqual(["CORPORATE_ACTION", "DIVIDEND", "FEE"]);
  });

  it("empty arrays everywhere produce zero events and no crash", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({ ...ACCOUNT, ...PERIOD }), 2024);
    expect(r.events).toEqual([]);
    expect(r.account.accountNumber).toBe("FF000123");
  });
});
