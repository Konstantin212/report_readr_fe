/**
 * Revolut statement entry point.
 *
 * Revolut exports three separate workbooks (savings, trading account,
 * trading P&L) that all describe ONE relationship. They are deliberately
 * given the same `accountNumber` so they merge into a single broker
 * account: splitting them would fragment the §20 tax scope, putting a
 * savings-interest row and the trade that funded it in different accounts
 * and breaking both bucketing and reconciliation.
 *
 * Revolut provides no account identifier inside the sheets — only a
 * statement id in some file names — so the constant below IS the account
 * key. If Revolut ever exposes a real account number, migrate this value
 * rather than introducing a second account.
 */
import type { ParsedBrokerStatement } from "../types";

import { detectRevolutStatementKind } from "./detect";
import { parseRevolutSavings, parseRevolutTrading, parseRevolutPnl } from "./parsers";
import { readXlsxSheet } from "./xlsx";

export const REVOLUT_ACCOUNT_NUMBER = "REVOLUT";

export function parseRevolutStatement(
  fileName: string,
  bytes: Uint8Array | ArrayBuffer,
  taxYear: number,
): ParsedBrokerStatement {
  const buffer = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const rows = readXlsxSheet(buffer);
  const kind = detectRevolutStatementKind(rows);
  if (!kind) throw new Error("UNKNOWN_REVOLUT_STATEMENT");

  const account = {
    broker: "REVOLUT" as const,
    brokerName: "Revolut",
    accountNumber: REVOLUT_ACCOUNT_NUMBER,
    fileName,
    taxYear,
  };

  if (kind === "savings") {
    return { account, events: parseRevolutSavings(rows, REVOLUT_ACCOUNT_NUMBER) };
  }
  if (kind === "trading") {
    return { account, events: parseRevolutTrading(rows, REVOLUT_ACCOUNT_NUMBER) };
  }

  // P&L: only the dividends are events. The "Income from Sells" rows are
  // Revolut's own FIFO result in the trade currency; our engine derives the
  // German figure from the trades at ECB date rates (§20 Abs. 4), so they
  // are reconciliation evidence rather than ledger entries.
  const { dividends } = parseRevolutPnl(rows, REVOLUT_ACCOUNT_NUMBER);
  return { account, events: dividends };
}

export { detectRevolutStatementKind } from "./detect";
export { parseRevolutSavings, parseRevolutTrading, parseRevolutPnl } from "./parsers";
export type { RevolutSaleEvidence } from "./parsers";
