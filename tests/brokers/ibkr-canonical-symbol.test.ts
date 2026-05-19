import { describe, it, expect } from "vitest";
import { parseInteractiveBrokersStatement } from "@/lib/brokers/ibkr";

const HEADER = `Statement,Header,Field Name,Field Value
Statement,Data,BrokerName,Interactive Brokers
Statement,Data,Period,"January 1, 2025 - December 31, 2025"
Account Information,Header,Field Name,Field Value
Account Information,Data,Account,U000000
Account Information,Data,Base Currency,EUR
Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code
`;

const FII_HEADER = `Financial Instrument Information,Header,Asset Category,Symbol,Description,Conid,Security ID,Underlying,Listing Exch,Multiplier,Type,Code
`;

describe("IBKR parser — canonical Underlying symbol", () => {
  it("rewrites EUDI to SPYW and attaches name", () => {
    const csv = HEADER
      + 'Trades,Data,Order,Stocks,EUR,EUDI,"2025-01-24, 09:29:52",133.0089,24.66,-3279.99,-3,3282.99,0,-3.99,O\n'
      + FII_HEADER
      + 'Financial Instrument Information,Data,Stocks,"EUDI, SPYW",SPDR EUR DIV ARISTOCRATS,103512838,IE00B5M1WJ87,SPYW,IBIS2,1,ETF,\n';
    const result = parseInteractiveBrokersStatement("t.csv", new TextEncoder().encode(csv), 2025);
    const trade = result.events.find(e => e.type === "TRADE")!;
    expect(trade.symbol).toBe("SPYW");
    expect(trade.isin).toBe("IE00B5M1WJ87");
    expect((trade as { name?: string }).name).toBe("SPDR EUR DIV ARISTOCRATS");
  });

  it("rewrites EVOs to EVO", () => {
    const csv = HEADER
      + 'Trades,Data,Order,Stocks,SEK,EVOs,"2025-12-10, 10:31:29",17,633.6,-10755.2,-98,10853.2,0,-72.4,O\n'
      + FII_HEADER
      + 'Financial Instrument Information,Data,Stocks,"EVOs, EVO",EVOLUTION AB,366244347,SE0012673267,EVO,SFB,1,COMMON,\n';
    const result = parseInteractiveBrokersStatement("t.csv", new TextEncoder().encode(csv), 2025);
    const trade = result.events.find(e => e.type === "TRADE")!;
    expect(trade.symbol).toBe("EVO");
    expect(trade.isin).toBe("SE0012673267");
    expect((trade as { name?: string }).name).toBe("EVOLUTION AB");
  });

  it("rewrites TRNl to TRN", () => {
    const csv = HEADER
      + 'Trades,Data,Order,Stocks,GBP,TRNl,"2025-12-10, 10:30:50",441.0319,2.222,-979.99,-10.9,990.89,0,-5.31,O\n'
      + FII_HEADER
      + 'Financial Instrument Information,Data,Stocks,"TRN, TRNl",TRAINLINE PLC,371871705,GB00BKDTK925,TRN,LSE,1,COMMON,\n';
    const result = parseInteractiveBrokersStatement("t.csv", new TextEncoder().encode(csv), 2025);
    const trade = result.events.find(e => e.type === "TRADE")!;
    expect(trade.symbol).toBe("TRN");
    expect(trade.isin).toBe("GB00BKDTK925");
    expect((trade as { name?: string }).name).toBe("TRAINLINE PLC");
  });

  it("preserves canonical when symbol already matches", () => {
    const csv = HEADER
      + 'Trades,Data,Order,Stocks,USD,COIN,"2025-01-10, 09:29:52",4.7794,173.30,-828.29,-3,831.29,0,-2.5,O\n'
      + FII_HEADER
      + 'Financial Instrument Information,Data,Stocks,COIN,COINBASE GLOBAL INC -CLASS A,123,US19260Q1076,COIN,NASDAQ,1,COMMON,\n';
    const result = parseInteractiveBrokersStatement("t.csv", new TextEncoder().encode(csv), 2025);
    const trade = result.events.find(e => e.type === "TRADE")!;
    expect(trade.symbol).toBe("COIN");
    expect((trade as { name?: string }).name).toBe("COINBASE GLOBAL INC -CLASS A");
  });
});
