import { describe, it, expect } from "vitest";
import { parseInteractiveBrokersStatement } from "@/lib/brokers/ibkr";

const CSV_WITH_FII = `Statement,Header,Field Name,Field Value
Statement,Data,BrokerName,Interactive Brokers
Statement,Data,Period,"January 1, 2024 - December 31, 2024"
Account Information,Header,Field Name,Field Value
Account Information,Data,Account,U000000
Account Information,Data,Base Currency,EUR
Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code
Trades,Data,Order,Stocks,EUR,EUDI,"2024-01-24, 09:29:52",133,24.66,-3279.78,-3,3282.78,0,-3.99,O
Trades,Data,Order,Forex,USD,EUR.USD,"2024-08-05, 09:17:52",909.79,1.09915,-999.99,-1.82,0,0,-3.28,
Trades,Data,Order,Bonds,USD,T 4 5/8 09/15/26 4.5%,"2024-04-04, 15:22:18",-1000,100.16,1001.44,-6.05,-1002.66,-7.27,-0.20,C
Financial Instrument Information,Header,Asset Category,Symbol,Description,Conid,ISIN,ListingExch,Multiplier,Type,Code
Financial Instrument Information,Data,Stocks,"EUDI, SPYW",SPDR EUR DIV ARISTOCRATS,103512838,IE00B5M1WJ87,IBIS2,1,ETF,
Financial Instrument Information,Data,Bonds,T 4 5/8 09/15/26,United States Treasury T 4 5/8 09/15/26,653738496,US91282CHY03,,1,Govt,
`;

describe("IBKR parser — ISIN enrichment, Forex routing, bond suffix", () => {
  const bytes = new TextEncoder().encode(CSV_WITH_FII);
  const result = parseInteractiveBrokersStatement("test.csv", bytes, 2024);
  const events = result.events;

  it("attaches ISIN to a stock trade", () => {
    const eudi = events.find(e => e.symbol === "EUDI");
    expect(eudi?.isin).toBe("IE00B5M1WJ87");
  });

  it("routes a Forex trade to FX_CONVERSION (no symbol/quantity on event)", () => {
    const fx = events.find(e => e.type === "FX_CONVERSION");
    expect(fx).toBeDefined();
    expect(fx?.symbol).toBeUndefined();
    expect(fx?.quantity).toBeUndefined();
    expect(fx?.source).toBe("Forex");
  });

  it("emits both currency legs of a Forex row so cash balances net correctly", () => {
    // EUR.USD row in fixture: Quantity=909.79, Proceeds=-999.99 USD.
    // Expect a -999.99 USD leg AND a +909.79 EUR leg.
    const fxLegs = events.filter(e => e.type === "FX_CONVERSION" && e.source === "Forex");
    expect(fxLegs.length).toBe(2);
    const usdLeg = fxLegs.find(e => e.currency === "USD");
    const eurLeg = fxLegs.find(e => e.currency === "EUR");
    expect(Number(usdLeg?.amount)).toBeCloseTo(-999.99, 2);
    expect(Number(eurLeg?.amount)).toBeCloseTo(909.79, 2);
  });

  it("strips bond yield suffix from symbol and attaches ISIN", () => {
    const bond = events.find(e => e.symbol === "T 4 5/8 09/15/26");
    expect(bond).toBeDefined();
    expect(bond?.isin).toBe("US91282CHY03");
  });

  it("does not emit EUR.USD or any Forex event as type=TRADE", () => {
    const stockTrades = events.filter(e => e.type === "TRADE");
    expect(stockTrades.every(t => !t.symbol?.includes("."))).toBe(true);
  });
});

describe("IBKR parser — Cash Report ending balances", () => {
  const CSV = `Statement,Header,Field Name,Field Value
Statement,Data,BrokerName,Interactive Brokers
Statement,Data,Period,"January 1, 2025 - December 31, 2025"
Account Information,Header,Field Name,Field Value
Account Information,Data,Account,U000000
Cash Report,Header,Currency Summary,Currency,Total,Securities,Futures
Cash Report,Data,Ending Settled Cash,Base Currency Summary,59.06,59.06,0
Cash Report,Data,Ending Settled Cash,EUR,6.65,6.65,0
Cash Report,Data,Ending Settled Cash,USD,42.18,42.18,0
Cash Report,Data,Ending Cash,EUR,6.65,6.65,0
`;
  const bytes = new TextEncoder().encode(CSV);
  const result = parseInteractiveBrokersStatement("test.csv", bytes, 2025);
  const snapshots = result.events.filter((e) => e.source === "CASH_REPORT_ENDING");

  it("emits one snapshot per non-base currency from Ending Settled Cash", () => {
    expect(snapshots.length).toBe(2);
    expect(new Set(snapshots.map((s) => s.currency))).toEqual(new Set(["EUR", "USD"]));
  });

  it("skips the Base Currency Summary aggregate row", () => {
    expect(snapshots.every((s) => s.currency !== "Base Currency Summary")).toBe(true);
    expect(snapshots.every((s) => s.currency !== "BASE")).toBe(true);
  });

  it("stores the IBKR balance verbatim in cashAmount and dates it to the statement end", () => {
    const eur = snapshots.find((s) => s.currency === "EUR");
    expect(Number(eur?.cashAmount)).toBeCloseTo(6.65, 2);
    expect(eur?.date).toBe("2025-12-31");
  });
});
