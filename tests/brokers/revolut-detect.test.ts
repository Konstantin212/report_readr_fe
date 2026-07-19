/**
 * Revolut detection + statement assembly.
 *
 * Revolut ships three different workbooks with no machine-readable marker
 * saying which is which, and users rename downloads, so the statement kind
 * is detected from the SHEET SHAPE rather than the file name.
 *
 * All three map to ONE broker account. They describe the same Revolut
 * relationship, and splitting them across accounts would fragment the tax
 * scope — a savings-interest row and the trade that funded it must land in
 * the same account for §20 bucketing and reconciliation to work.
 */
import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";

import { detectBroker } from "@/lib/brokers/detect";
import { detectRevolutStatementKind } from "@/lib/brokers/revolut/detect";
import { parseBrokerStatement } from "@/lib/brokers";
import type { SheetRow } from "@/lib/brokers/revolut/xlsx";

const row = (r: number, cells: Record<string, string>): SheetRow => ({ r, cells });

function workbook(rowsXml: string): Uint8Array {
  return zipSync({
    "xl/worksheets/sheet1.xml": strToU8(
      `<?xml version="1.0"?><worksheet><sheetData>${rowsXml}</sheetData></worksheet>`,
    ),
  });
}

const inline = (col: string, r: number, text: string) =>
  `<c r="${col}${r}" t="inlineStr"><is><t>${text}</t></is></c>`;

describe("detectBroker — xlsx", () => {
  it("detects Revolut from the zip container", () => {
    const bytes = workbook(`<row r="1">${inline("A", 1, "Date")}</row>`);
    expect(detectBroker({ fileName: "statement.xlsx", bytes })).toBe("REVOLUT");
  });

  it("does not misclassify the CSV and JSON brokers", () => {
    const ibkr = strToU8("Statement,Header,Field Name,Field Value\n");
    expect(detectBroker({ fileName: "U123.csv", bytes: ibkr })).toBe("INTERACTIVE_BROKERS");
    const ff = strToU8('{"trades":{"detailed":[]}}');
    expect(detectBroker({ fileName: "ff.json", bytes: ff })).toBe("FREEDOM_FINANCE");
  });
});

describe("detectRevolutStatementKind — by sheet shape, not file name", () => {
  it("recognises the savings statement by its Gross Interest column", () => {
    const rows = [row(1, { A: "Date", B: "Description", C: "Gross Interest", D: "Money in" })];
    expect(detectRevolutStatementKind(rows)).toBe("savings");
  });

  it("recognises the trading statement by Ticker + FX Rate", () => {
    const rows = [row(1, { A: "Date", B: "Ticker", C: "Type", G: "Currency", H: "FX Rate" })];
    expect(detectRevolutStatementKind(rows)).toBe("trading");
  });

  it("recognises the P&L statement by its section title", () => {
    const rows = [row(1, { A: "Income from Sells" }), row(2, { A: "Date acquired" })];
    expect(detectRevolutStatementKind(rows)).toBe("pnl");
  });

  it("returns null for an unrecognised sheet rather than guessing", () => {
    expect(detectRevolutStatementKind([row(1, { A: "Something else" })])).toBeNull();
  });
});

describe("parseBrokerStatement — Revolut end to end", () => {
  it("parses a savings workbook into interest events on a single account", () => {
    const bytes = workbook(
      `<row r="1">${inline("A", 1, "Date")}${inline("B", 1, "Description")}${inline("C", 1, "Gross Interest")}${inline("D", 1, "Money in")}</row>` +
        `<row r="4"><c r="A4"><v>45806</v></c>${inline("B", 4, "Net Interest Paid to 'Doomsday' for 29 May 2025")}<c r="C4"><v>0.0225</v></c>${inline("D", 4, "â_x0082_¬0.18")}</row>`,
    );
    const parsed = parseBrokerStatement({ fileName: "savings.xlsx", bytes, taxYear: 2025 });

    expect(parsed.broker).toBe("REVOLUT");
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]).toMatchObject({
      type: "INTEREST",
      date: "2025-05-29",
      currency: "EUR",
      amount: "0.18",
    });
  });

  it("gives all three workbooks the SAME account number so they merge", () => {
    const savings = workbook(
      `<row r="1">${inline("A", 1, "Date")}${inline("B", 1, "Description")}${inline("C", 1, "Gross Interest")}</row>`,
    );
    const trading = workbook(
      `<row r="1">${inline("A", 1, "Date")}${inline("B", 1, "Ticker")}${inline("C", 1, "Type")}${inline("H", 1, "FX Rate")}</row>`,
    );
    const a = parseBrokerStatement({ fileName: "s.xlsx", bytes: savings, taxYear: 2025 });
    const b = parseBrokerStatement({ fileName: "t.xlsx", bytes: trading, taxYear: 2025 });
    expect(a.account.accountNumber).toBe(b.account.accountNumber);
  });

  it("throws a specific error for an xlsx that is not a Revolut export", () => {
    const bytes = workbook(`<row r="1">${inline("A", 1, "Nope")}</row>`);
    expect(() => parseBrokerStatement({ fileName: "x.xlsx", bytes, taxYear: 2025 })).toThrow(
      /UNKNOWN_REVOLUT_STATEMENT/,
    );
  });
});
