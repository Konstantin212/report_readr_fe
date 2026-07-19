/**
 * Minimal SheetML reader for Revolut .xlsx exports.
 *
 * Revolut only exports .xlsx, and statement parsing runs in a browser Web
 * Worker (src/lib/brokers/worker.ts), so this is a focused reader over
 * fflate rather than a heavyweight spreadsheet library.
 *
 * Two traps are locked in here because both produce silently WRONG money
 * rather than a crash:
 *
 *  1. Excel OMITS empty cells. A row's cells must be keyed by the column
 *     letter in the `r` attribute, never by their sequence — otherwise every
 *     value after a blank cell shifts one column left and the "Money in"
 *     amount is read out of the "Balance" column.
 *
 *  2. Revolut mangles the euro sign as `â_x0082_¬` — an XML escape that
 *     CONTAINS DIGITS. A naive numeric cleaner reads `€0.86` as `820.86`.
 *     The `_xHHHH_` escape must be stripped BEFORE any digit extraction.
 */
import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";

import {
  columnOf,
  parseSharedStrings,
  parseSheetRows,
  excelSerialToIso,
  cleanMoney,
  readXlsxSheet,
} from "@/lib/brokers/revolut/xlsx";

describe("columnOf", () => {
  it("extracts the column letters from a cell reference", () => {
    expect(columnOf("C5")).toBe("C");
    expect(columnOf("AB12")).toBe("AB");
  });
});

describe("cleanMoney — the euro-mangling trap", () => {
  it("does NOT read the digits inside the _x0082_ escape as part of the number", () => {
    // This is the actual byte sequence Revolut emits for "€0.86".
    expect(cleanMoney("â_x0082_¬0.86")).toBe(0.86);
    expect(cleanMoney("â_x0082_¬1,234.50")).toBe(1234.5);
  });

  it("parses ordinary money and currency-prefixed amounts", () => {
    expect(cleanMoney("USD 799")).toBe(799);
    expect(cleanMoney("-12.34")).toBe(-12.34);
    expect(cleanMoney("1,000.00")).toBe(1000);
  });

  it("returns null for blanks and non-numeric text", () => {
    expect(cleanMoney("")).toBeNull();
    expect(cleanMoney(undefined)).toBeNull();
    expect(cleanMoney("n/a")).toBeNull();
  });
});

describe("excelSerialToIso", () => {
  it("converts the 1900-system serial (with Excel's leap-year bug) to ISO", () => {
    expect(excelSerialToIso(45658)).toBe("2025-01-01");
    expect(excelSerialToIso(45291)).toBe("2023-12-31");
  });
});

describe("parseSharedStrings", () => {
  it("reads <si> entries including ones split across runs", () => {
    const xml =
      '<sst><si><t>Date</t></si><si><r><t>Money</t></r><r><t> in</t></r></si></sst>';
    expect(parseSharedStrings(xml)).toEqual(["Date", "Money in"]);
  });
});

describe("parseSheetRows", () => {
  const shared = ["Deposit", "Net Interest Paid"];

  it("keys cells by column letter so OMITTED cells do not shift values", () => {
    // Row 2 has no B cell. A naive sequential reader would slide the
    // "9.99" from D into C and misreport the amount.
    const xml = `<worksheet><sheetData>
      <row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>1.5</v></c></row>
      <row r="2"><c r="A2" t="s"><v>1</v></c><c r="D2"><v>9.99</v></c></row>
    </sheetData></worksheet>`;
    const rows = parseSheetRows(xml, shared);
    expect(rows[0].cells).toEqual({ A: "Deposit", C: "1.5" });
    expect(rows[1].cells).toEqual({ A: "Net Interest Paid", D: "9.99" });
    expect(rows[1].cells.C).toBeUndefined();
  });

  it("resolves inline strings as well as shared strings", () => {
    const xml =
      '<worksheet><sheetData><row r="1">' +
      '<c r="A1" t="inlineStr"><is><t>VUSA</t></is></c>' +
      "</row></sheetData></worksheet>";
    expect(parseSheetRows(xml, shared)[0].cells.A).toBe("VUSA");
  });
});

describe("readXlsxSheet — end to end over a real zip container", () => {
  // Built in-memory so no broker file is ever committed as a fixture.
  function buildWorkbook(): Uint8Array {
    const sharedStrings =
      '<?xml version="1.0"?><sst><si><t>Date</t></si><si><t>Money in</t></si>' +
      "<si><t>Net Interest Paid</t></si></sst>";
    const sheet =
      '<?xml version="1.0"?><worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
      '<row r="2"><c r="A2"><v>45658</v></c><c r="B2" t="inlineStr"><is><t>â_x0082_¬0.86</t></is></c></row>' +
      "</sheetData></worksheet>";
    return zipSync({
      "xl/sharedStrings.xml": strToU8(sharedStrings),
      "xl/worksheets/sheet1.xml": strToU8(sheet),
    });
  }

  it("returns raw column-keyed rows, header row included", () => {
    // Raw rather than header-mapped: the real savings sheet repeats its
    // header at row 3 and the P&L sheet holds two sections, so each parser
    // does its own header detection.
    const rows = readXlsxSheet(buildWorkbook());
    expect(rows).toHaveLength(2);
    expect(rows[0].cells).toEqual({ A: "Date", B: "Money in" });
    expect(rows[1].cells.A).toBe("45658");
    expect(cleanMoney(rows[1].cells.B)).toBe(0.86);
  });
});
