import { describe, it, expect } from "vitest";
import { parseFreedomFinanceStatement } from "@/lib/brokers/freedom";

/**
 * Regression tests against the exact bug pattern surfaced by user 900000's
 * real Freedom24 statement. Three distinct defects were compounding to
 * massively misreport cash, surface phantom positions, and prevent any
 * Stooq quote lookup from succeeding on FF-side tickers.
 */

function bytes(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj));
}

const ACCOUNT = { plainAccountInfoData: { account: "FF000123", currency: "USD" } };
const PERIOD = { date_start: "2024-01-01", date_end: "2024-12-31" };

describe("FF trade-sign convention (the cash-inflation root cause)", () => {
  it("BUY with positive `summ` becomes a NEGATIVE cashAmount", () => {
    // In Freedom24's export, `summ` is the absolute trade total. Only the
    // `operation` field tells you whether cash flowed in or out.
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      trades: { detailed: [{
        id: "t1", short_date: "2024-03-04", instr_nm: "TTWO.US", isin: "US8740541094",
        operation: "buy", curr_c: "USD", q: 4, p: 119.14, summ: 476.56,
        commission: 1, profit: 0,
      }]},
    }), 2024);
    const t = r.events[0];
    expect(t.cashAmount).toBe("-477.56"); // -(476.56) - 1 fee
    expect(t.amount).toBe("-476.56");
  });

  it("SELL with positive `summ` keeps a POSITIVE cashAmount", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      trades: { detailed: [{
        id: "t2", short_date: "2024-08-12", instr_nm: "AAPL.US",
        operation: "sell", curr_c: "USD", q: 3, p: 200, summ: 600,
        commission: 1.5, profit: 80,
      }]},
    }), 2024);
    const t = r.events[0];
    expect(t.cashAmount).toBe("598.5"); // 600 - 1.5 fee, still positive
    expect(t.amount).toBe("600");
    expect(t.realizedPnl).toBe("80");
  });

  it("legacy reports with already-signed `summ` (negative on buys) still parse correctly", () => {
    // Older Freedom Finance reports occasionally pre-sign `summ`. The
    // parser must be idempotent: a buy whose `summ` is already negative
    // shouldn't end up positive.
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      trades: { detailed: [{
        short_date: "2024-03-04", instr_nm: "BNTX.US",
        operation: "buy", curr_c: "USD", q: 1, p: 203.76, summ: -203.76,
        commission: 2.22, profit: 0,
      }]},
    }), 2024);
    const t = r.events[0];
    expect(t.cashAmount).toBe("-205.98");
    expect(t.amount).toBe("-203.76");
  });
});

describe("FF FX-pair trades (eliminates RUR/USD-style phantom positions)", () => {
  it("RUR/USD buy emits FX_CONVERSION events, not TRADE", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      trades: { detailed: [{
        short_date: "2021-06-04", instr_nm: "RUR/USD",
        operation: "buy", curr_c: "USD", q: 4100, p: 0.01379024, summ: 56.54,
        commission: 0,
      }]},
    }), 2024);
    expect(r.events.every(e => e.type !== "TRADE")).toBe(true);
    expect(r.events.some(e => e.type === "FX_CONVERSION")).toBe(true);
  });

  it("FX pair emits BOTH currency legs (base + quote) so cash balances net cleanly", () => {
    // RUR/USD buy 4100 rubles for $56.54: should produce
    //   +4100 RUR leg AND -56.54 USD leg
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      trades: { detailed: [{
        short_date: "2021-06-04", instr_nm: "RUR/USD",
        operation: "buy", curr_c: "USD", q: 4100, p: 0.01379024, summ: 56.54,
        commission: 0,
      }]},
    }), 2024);
    const fx = r.events.filter(e => e.type === "FX_CONVERSION");
    expect(fx).toHaveLength(2);
    const rur = fx.find(e => e.currency === "RUR");
    const usd = fx.find(e => e.currency === "USD");
    expect(rur?.amount).toBe("4100");          // base leg, positive (received)
    expect(Number(usd?.amount)).toBeCloseTo(-56.54, 2); // quote leg, negative (paid)
  });

  it("EUR/USD buy from real data: +EUR leg, -USD leg", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      trades: { detailed: [{
        short_date: "2024-07-05", instr_nm: "EUR/USD",
        operation: "buy", curr_c: "USD", q: 132.95, p: 1.0837909, summ: 144.09,
        commission: 0,
      }]},
    }), 2024);
    const fx = r.events.filter(e => e.type === "FX_CONVERSION");
    expect(fx).toHaveLength(2);
    expect(fx.find(e => e.currency === "EUR")?.amount).toBe("132.95");
    expect(Number(fx.find(e => e.currency === "USD")?.amount)).toBeCloseTo(-144.09, 2);
  });

  it("USD/EUR sell flips: sold USD (negative), received EUR (positive)", () => {
    // USD/EUR sell 126.88: sold 126.88 USD, received 110.97 EUR
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      trades: { detailed: [{
        short_date: "2025-01-10", instr_nm: "USD/EUR",
        operation: "sell", curr_c: "EUR", q: 126.88, p: 0.87460593, summ: 110.97,
        commission: 0,
      }]},
    }), 2024);
    const fx = r.events.filter(e => e.type === "FX_CONVERSION");
    expect(Number(fx.find(e => e.currency === "USD")?.amount)).toBeCloseTo(-126.88, 2);
    expect(Number(fx.find(e => e.currency === "EUR")?.amount)).toBeCloseTo(110.97, 2);
  });

  it("FX pair has no symbol — so it never surfaces as a position", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      trades: { detailed: [{
        short_date: "2024-07-05", instr_nm: "EUR/USD",
        operation: "buy", curr_c: "USD", q: 100, p: 1.08, summ: 108,
      }]},
    }), 2024);
    expect(r.events.every(e => e.symbol === undefined)).toBe(true);
  });
});

describe("FF symbol normalisation (so Stooq can actually find these)", () => {
  it("strips the .US / .EU exchange suffix from stock tickers", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      trades: { detailed: [
        { short_date: "2024-01-01", instr_nm: "TTWO.US", operation: "buy",
          curr_c: "USD", q: 1, p: 100, summ: 100 },
        { short_date: "2024-01-02", instr_nm: "RYA.EU", operation: "buy",
          curr_c: "EUR", q: 1, p: 10, summ: 10 },
        { short_date: "2024-01-03", instr_nm: "SCHD.US", operation: "buy",
          curr_c: "USD", q: 1, p: 50, summ: 50 },
      ]},
    }), 2024);
    const symbols = r.events.map(e => e.symbol).filter(Boolean);
    expect(symbols).toContain("TTWO");
    expect(symbols).toContain("RYA");
    expect(symbols).toContain("SCHD");
    expect(symbols.every(s => !s!.includes("."))).toBe(true);
  });

  it("FX pairs (with slash) are NOT touched by the suffix-stripper", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      trades: { detailed: [{
        short_date: "2024-07-05", instr_nm: "EUR/USD", operation: "buy",
        curr_c: "USD", q: 100, p: 1.08, summ: 108,
      }]},
    }), 2024);
    // FX pairs produce FX_CONVERSION (no symbol), so the strip is a no-op
    // here. The point is they shouldn't somehow end up with a normalised
    // stock symbol like "EUR-USD".
    expect(r.events.every(e => e.symbol === undefined)).toBe(true);
  });

  it("cash_in_outs dividend `ticker` is also normalised", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      cash_in_outs: [{
        currency: "USD", type: "dividend", datetime: "2024-03-15 16:00:00",
        amount: "42.50", ticker: "AAPL.US", comment: "Cash dividend",
      }],
    }), 2024);
    expect(r.events[0].symbol).toBe("AAPL");
  });
});

describe("FF corporate-action splits should NOT contribute to cash", () => {
  it("a securities_in_outs split row has no cashAmount", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      securities_in_outs: [{
        ticker: "SCHD.US", type: "split", datetime: "2024-10-11 15:00:00",
        quantity: "-68", balance_currency: "USD",
        market_value: "-962.20",
        comment: "Stock split SCHD.US factor 1/3",
      }],
    }), 2024);
    const e = r.events[0];
    expect(e.type).toBe("CORPORATE_ACTION");
    expect(e.quantity).toBe("-68");
    // market_value is informational; we explicitly omit the cashAmount so
    // the cash accessor doesn't sum a phantom -$962 flow that never
    // actually happened.
    expect(e.cashAmount).toBeUndefined();
  });
});

describe("end-to-end: the user's real portfolio shape", () => {
  it("produces 0 phantom positions for the user's actual FX/cash trade mix", () => {
    const r = parseFreedomFinanceStatement("x.json", bytes({
      ...ACCOUNT, ...PERIOD,
      trades: { detailed: [
        // FX pairs from the real file
        { short_date: "2021-06-04", instr_nm: "RUR/USD", operation: "buy",  curr_c: "USD", q: 4100,  p: 0.01379, summ: 56.54 },
        { short_date: "2021-06-04", instr_nm: "RUR/USD", operation: "sell", curr_c: "USD", q: 3340.5, p: 0.01351, summ: 45.14 },
        { short_date: "2024-07-05", instr_nm: "EUR/USD", operation: "buy",  curr_c: "USD", q: 132.95, p: 1.084,  summ: 144.09 },
        { short_date: "2025-01-10", instr_nm: "USD/EUR", operation: "sell", curr_c: "EUR", q: 126.88, p: 0.8746, summ: 110.97 },
        // A real stock trade
        { short_date: "2024-04-01", instr_nm: "TTWO.US", operation: "buy",  curr_c: "USD", q: 4,      p: 119.14, summ: 476.56 },
      ]},
    }), 2024);
    const trades = r.events.filter(e => e.type === "TRADE");
    // Exactly ONE stock trade — none of the FX pairs leaked through.
    expect(trades).toHaveLength(1);
    expect(trades[0].symbol).toBe("TTWO");
    // BUY cash impact is negative now.
    expect(Number(trades[0].cashAmount)).toBeLessThan(0);
  });
});
