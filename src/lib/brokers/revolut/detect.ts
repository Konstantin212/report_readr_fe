/**
 * Which of Revolut's three workbooks is this?
 *
 * Detection is by SHEET SHAPE, not file name: Revolut's default names are
 * long and users rename downloads, and mis-identifying a workbook would
 * route rows through the wrong column mapping and silently produce wrong
 * money rather than an error.
 */
import type { SheetRow } from "./xlsx";

export type RevolutStatementKind = "savings" | "trading" | "pnl";

/** Enough rows to clear the P&L section title and any repeated header. */
const PROBE_ROWS = 12;

export function detectRevolutStatementKind(rows: SheetRow[]): RevolutStatementKind | null {
  const head = rows.slice(0, PROBE_ROWS);
  const values = head.flatMap((r) => Object.values(r.cells));
  const has = (label: string) => values.some((v) => v?.toLowerCase() === label);

  // The P&L workbook is the only one with section titles.
  if (values.some((v) => /^income from sells/i.test(v ?? ""))) return "pnl";
  if (has("gross interest") && has("description")) return "savings";
  if (has("ticker") && has("fx rate")) return "trading";
  return null;
}
