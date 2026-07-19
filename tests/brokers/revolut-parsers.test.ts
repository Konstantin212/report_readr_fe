/**
 * Revolut statement parsers — pure, row-in / event-out.
 *
 * Fixtures are hand-written row objects mirroring the REAL export shapes
 * (verified against the user's actual files); no broker statement is ever
 * committed to the repo.
 *
 * Three facts drive most of these assertions, and each one silently
 * produces wrong tax figures if missed:
 *
 *  1. In the savings sheet, column C ("Gross Interest") is the daily APY
 *     RATE (0.0225 = 2.25 %), not an amount. The euro amount lives in
 *     "Money in". Reading C as money reports €0.02 of interest per row.
 *  2. In the trading sheet, DIVIDEND rows carry the amount NET of
 *     withholding, in the trade currency (USD 5.47). The P&L sheet reports
 *     the SAME dividend as gross €5.82 / WHT €0.86 / net €4.96. German tax
 *     needs the gross plus the withholding, so the P&L is the authoritative
 *     dividend source and the trading sheet must not emit them too.
 *  3. The `FX Rate` column is Revolut's own rate. §20 EStG requires the ECB
 *     rate at each transaction date, so the column is kept as evidence and
 *     never used to convert.
 */
import { describe, it, expect } from "vitest";

import {
  parseRevolutSavings,
  parseRevolutTrading,
  parseRevolutPnl,
} from "@/lib/brokers/revolut/parsers";
import type { SheetRow } from "@/lib/brokers/revolut/xlsx";

const row = (r: number, cells: Record<string, string>): SheetRow => ({ r, cells });
const ACC = "REV123";
/** The real byte sequence Revolut writes for the euro sign. */
const EUR = "â_x0082_¬";

describe("parseRevolutSavings", () => {
  const rows: SheetRow[] = [
    row(1, { A: "Date", B: "Description", C: "Gross Interest", D: "Money in", E: "Money out", F: "Balance" }),
    // The real sheet repeats its header at row 3.
    row(3, { A: "Date", B: "Description", C: "Gross Interest", D: "Money in", E: "Money out", F: "Balance" }),
    row(4, { A: "45804.0", B: "Deposit to 'Doomsday'", D: `${EUR}2,800.00`, F: `${EUR}2,800.00` }),
    row(6, { A: "45806.0", B: "Net Interest Paid to 'Doomsday' for 29 May 2025", C: "0.0225", D: `${EUR}0.18`, F: `${EUR}3,800.18` }),
    row(9, { A: "45808.0", B: "Withdrawal from 'Doomsday'", E: `${EUR}100.00`, F: `${EUR}3,700.53` }),
  ];
  const events = parseRevolutSavings(rows, ACC);

  it("skips both the leading header and the repeated one", () => {
    expect(events).toHaveLength(3);
    expect(events.some((e) => e.description === "Description")).toBe(false);
  });

  it("takes the interest AMOUNT from Money in, never the APY rate in column C", () => {
    const interest = events.find((e) => e.type === "INTEREST")!;
    expect(interest.amount).toBe("0.18");
    expect(interest.amount).not.toBe("0.0225");
    expect(interest.currency).toBe("EUR");
  });

  it("dates interest from the serial in column A (Zuflussprinzip, §11 EStG)", () => {
    // Revolut credits savings interest daily, so the serial and the
    // "for <date>" in the description agree here — the date must still come
    // from the column, never from parsing English text out of the label.
    const interest = events.find((e) => e.type === "INTEREST")!;
    expect(interest.date).toBe("2025-05-29");
  });

  it("maps deposits and withdrawals to cash transfers with the right sign", () => {
    const deposit = events.find((e) => e.description?.startsWith("Deposit"))!;
    expect(deposit.type).toBe("CASH_TRANSFER");
    expect(deposit.cashAmount).toBe("2800");

    const withdrawal = events.find((e) => e.description?.startsWith("Withdrawal"))!;
    expect(withdrawal.type).toBe("CASH_TRANSFER");
    expect(withdrawal.cashAmount).toBe("-100");
  });

  it("signs `amount` too, not just `cashAmount`, on a withdrawal", () => {
    // The dashboard cash total sums CASH_TRANSFER.amount (data/dashboard.ts),
    // NOT cashAmount, and the FX layer converts amount independently — so a
    // positive `amount` on a withdrawal ADDS it to cash. Every other parser
    // keeps the two identical and signed (ibkr.ts, freedom.ts).
    const withdrawal = events.find((e) => e.description?.startsWith("Withdrawal"))!;
    expect(withdrawal.amount).toBe("-100");
    expect(withdrawal.amount).toBe(withdrawal.cashAmount);

    const deposit = events.find((e) => e.description?.startsWith("Deposit"))!;
    expect(deposit.amount).toBe(deposit.cashAmount);
  });
});

describe("parseRevolutTrading", () => {
  const rows: SheetRow[] = [
    row(1, { A: "Date", B: "Ticker", C: "Type", D: "Quantity", E: "Price per share", F: "Total Amount", G: "Currency", H: "FX Rate" }),
    row(2, { A: "2023-10-18T17:55:56.274100Z", C: "CASH TOP-UP", F: "EUR 759", G: "EUR", H: "1.0" }),
    row(3, { A: "2023-10-18T17:59:32.755427Z", C: "CASH WITHDRAWAL", F: "EUR -759", G: "EUR", H: "1.0" }),
    row(5, { A: "2023-10-18T18:00:30.587Z", B: "BLK", C: "BUY - MARKET", D: "1.28690386", E: "USD 620.87", F: "USD 799", G: "USD", H: "1.0568" }),
    row(6, { A: "2023-11-02T09:11:20.557383Z", C: "CUSTODY FEE", F: "USD -0.08", G: "USD", H: "1.0618" }),
    row(7, { A: "2025-07-30T10:00:00.000Z", B: "BLK", C: "SELL - MARKET", D: "0.4", E: "USD 1117.30", F: "USD 446.92", G: "USD", H: "1.16" }),
    row(8, { A: "2023-12-26T09:13:38.522718Z", B: "BLK", C: "DIVIDEND", F: "USD 5.47", G: "USD", H: "1.1033" }),
  ];
  const events = parseRevolutTrading(rows, ACC);

  it("parses a buy, stripping the currency prefix from price and amount", () => {
    const buy = events.find((e) => e.description === "BUY - MARKET")!;
    expect(buy.type).toBe("TRADE");
    expect(buy.symbol).toBe("BLK");
    expect(buy.quantity).toBe("1.28690386");
    expect(buy.price).toBe("620.87");
    expect(buy.amount).toBe("799");
    expect(buy.currency).toBe("USD");
    expect(buy.date).toBe("2023-10-18");
  });

  it("signs a sell's quantity negative", () => {
    const sell = events.find((e) => e.description === "SELL - MARKET")!;
    expect(sell.quantity).toBe("-0.4");
    expect(sell.amount).toBe("446.92");
  });

  it("maps custody fees and cash movements", () => {
    expect(events.find((e) => e.description === "CUSTODY FEE")!.type).toBe("FEE");
    expect(events.find((e) => e.description === "CASH TOP-UP")!.type).toBe("CASH_TRANSFER");
    expect(events.find((e) => e.description === "CASH WITHDRAWAL")!.type).toBe("CASH_TRANSFER");
  });

  it("does NOT emit dividends — they are net here; the P&L sheet has gross + WHT", () => {
    expect(events.some((e) => e.type === "DIVIDEND")).toBe(false);
  });

  it("never pre-converts to EUR using the broker's own FX Rate column", () => {
    // §20 EStG wants the ECB rate at the transaction date, so the FX Rate
    // column is deliberately DISCARDED rather than carried — the FX layer
    // converts later. 799 / 1.0568 = 756.06 must not appear anywhere.
    const buy = events.find((e) => e.description === "BUY - MARKET")!;
    expect(buy.amountEur).toBeUndefined();
    expect(buy.cashAmountEur).toBeUndefined();
  });
});

describe("parseRevolutPnl", () => {
  const rows: SheetRow[] = [
    row(1, { A: "Income from Sells" }),
    row(2, { A: "Date acquired", B: "Date sold", C: "Symbol", D: "Security name", E: "ISIN", F: "Country", G: "Quantity", H: "Cost basis", I: "Gross proceeds", J: "Gross PnL", K: "Currency" }),
    row(3, { A: "45217.0", B: "45868.0", C: "BLK", D: "BlackRock", E: "US09290D1019", F: "US", G: "0.4", H: "248.35", I: "446.92", J: "198.57", K: "USD" }),
    row(5, { A: "Other income & fees" }),
    row(6, { A: "Date", B: "Symbol", C: "Security name", D: "ISIN", E: "Country", F: "Gross amount", G: "Withholding tax", H: "Net Amount", I: "Currency" }),
    row(7, { A: "45286.0", B: "BLK", C: "BlackRock dividend", D: "US09290D1019", E: "US", F: "5.82", G: `${EUR}0.86`, H: `${EUR}4.96`, I: "EUR" }),
  ];
  const { sales, dividends } = parseRevolutPnl(rows, ACC);

  it("splits the two sections in one sheet", () => {
    expect(sales).toHaveLength(1);
    expect(dividends).toHaveLength(1);
  });

  it("reads the sell row as EVIDENCE of Revolut's own FIFO, not as an event", () => {
    expect(sales[0]).toMatchObject({
      symbol: "BLK",
      isin: "US09290D1019",
      quantity: "0.4",
      acquiredAt: "2023-10-18",
      soldAt: "2025-07-30",
      costBasis: "248.35",
      grossProceeds: "446.92",
      grossPnl: "198.57",
      currency: "USD",
    });
  });

  it("reads the dividend GROSS with its withholding tax", () => {
    expect(dividends[0]).toMatchObject({
      type: "DIVIDEND",
      symbol: "BLK",
      isin: "US09290D1019",
      date: "2023-12-26",
      currency: "EUR",
      amount: "5.82",
      withholdingTax: "0.86",
    });
  });

  it("does not read the mangled euro escape as digits (€0.86, not 820.86)", () => {
    expect(dividends[0].withholdingTax).toBe("0.86");
    expect(dividends[0].withholdingTax).not.toBe("820.86");
  });
});
