/**
 * Minimal SheetML (.xlsx) reader for Revolut statement exports.
 *
 * Revolut exports only .xlsx, and broker parsing runs inside a browser Web
 * Worker (`src/lib/brokers/worker.ts`), so this is a focused reader over
 * fflate rather than a general spreadsheet library — no Node APIs, no
 * megabyte of parser we don't use.
 *
 * Scope is deliberately narrow: one flat sheet of scalar cells, which is
 * all Revolut emits. No formulas, styles, merged cells or multi-sheet
 * workbooks.
 *
 * Two behaviours here exist because getting them wrong yields silently
 * WRONG money rather than an error:
 *
 *  - **Cells are keyed by the column letter in the `r` attribute.** Excel
 *    omits empty cells entirely, so a sequential reader slides every later
 *    value one column left the moment a blank appears — reading "Money in"
 *    out of the "Balance" column.
 *  - **`_xHHHH_` escapes are stripped before any digit is read.** Revolut
 *    writes the euro sign as `â_x0082_¬`, an escape that CONTAINS DIGITS;
 *    a naive numeric cleaner turns `€0.86` into `820.86`.
 */
import { unzipSync, strFromU8 } from "fflate";

export type SheetRow = { r: number; cells: Record<string, string> };

/** Column letters of a cell reference: `"AB12"` → `"AB"`. */
export function columnOf(ref: string): string {
  return ref.match(/^[A-Z]+/)?.[0] ?? "";
}

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXml(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m] ?? m);
}

/**
 * Parse a money-ish cell to a number.
 *
 * Order matters: the `_xHHHH_` escape is removed FIRST, then all non-ASCII
 * (the `â` and `¬` bytes left over from the mangled euro sign), and only
 * then is a number matched. Reversing those steps reintroduces the
 * €0.86 → 820.86 bug.
 */
export function cleanMoney(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const stripped = String(raw)
    .replace(/_x[0-9A-Fa-f]{4}_/g, "")
    .replace(/[^\x20-\x7E]/g, "");
  const match = stripped.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

/**
 * Excel 1900-system serial → ISO date. Epoch is 1899-12-30 rather than
 * 1899-12-31 because Excel treats 1900 as a leap year (it wasn't).
 */
export function excelSerialToIso(serial: number): string {
  return new Date((Number(serial) - 25569) * 86_400_000).toISOString().slice(0, 10);
}

/** Shared-string table. An `<si>` may be split across several `<r>` runs. */
export function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    decodeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")),
  );
}

/** Rows of a worksheet, each cell keyed by its column letter. */
export function parseSheetRows(xml: string, shared: string[]): SheetRow[] {
  return [...xml.matchAll(/<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const cells: Record<string, string> = {};
    for (const cell of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1] ?? "";
      const inner = cell[2];
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      if (!ref || inner === undefined) continue;
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];

      let value: string | undefined;
      if (type === "inlineStr") {
        value = [...inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("");
      } else {
        const raw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (raw === undefined) continue;
        value = type === "s" ? shared[Number(raw)] ?? "" : raw;
      }
      if (value === undefined) continue;
      cells[columnOf(ref)] = decodeXml(value);
    }
    return { r: Number(rowMatch[1]), cells };
  });
}

/**
 * Read the first worksheet of an .xlsx as raw, column-keyed rows.
 *
 * Deliberately NOT header-mapped. The real Revolut exports defeat a single
 * header row two different ways: the savings sheet repeats its header at
 * row 3, and the P&L sheet packs TWO sections ("Income from Sells" and
 * "Other income & fees") into one sheet, each with its own header. Each
 * parser therefore finds its own header and skips repeats.
 *
 * Values stay STRINGS — callers decide whether a cell is money
 * (`cleanMoney`), a serial date (`excelSerialToIso`) or free text, because
 * Revolut mixes all three in a single sheet.
 */
export function readXlsxSheet(bytes: Uint8Array): SheetRow[] {
  const files = unzipSync(bytes);
  const sharedXml = files["xl/sharedStrings.xml"];
  const shared = sharedXml ? parseSharedStrings(strFromU8(sharedXml)) : [];

  const sheetPath =
    Object.keys(files)
      .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p))
      .sort()[0] ?? "";
  const sheetBytes = files[sheetPath];
  if (!sheetBytes) return [];

  return parseSheetRows(strFromU8(sheetBytes), shared);
}
