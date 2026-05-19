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
