/**
 * Revolut statement parsers — pure functions over already-read sheet rows.
 *
 * Revolut exports three separate workbooks and they overlap, so which file
 * a number comes from is a correctness decision, not a preference:
 *
 *  - **Savings statement** — daily interest credits (§20 Abs. 1 Nr. 7).
 *    Column C ("Gross Interest") is the APY RATE (0.0225 = 2.25 %), not an
 *    amount; the euro amount is in "Money in".
 *  - **Trading account statement** — the transaction log. Its DIVIDEND rows
 *    carry the amount NET of withholding in the trade currency (USD 5.47),
 *    which is unusable for German tax, so dividends are deliberately NOT
 *    emitted here.
 *  - **Trading P&L statement** — two sections in one sheet. "Other income &
 *    fees" reports the SAME dividend as gross €5.82 / WHT €0.86 / net
 *    €4.96, which is what §20 needs, so this is the authoritative dividend
 *    source. "Income from Sells" is Revolut's OWN FIFO result and is
 *    returned as evidence, never as an event — our FIFO engine computes the
 *    German result from the trades using ECB rates.
 *
 * The `FX Rate` column is discarded everywhere. §20 EStG requires the ECB
 * reference rate at each transaction date; using the broker's rate would
 * produce a number that reconciles to Revolut and not to the Finanzamt.
 */
import type { NormalizedEvent } from "@/lib/domain/types";

import { cleanMoney, excelSerialToIso, type SheetRow } from "./xlsx";

const BROKER = "REVOLUT" as const;

/** Revolut's own realised-sale figures — reconciliation evidence, not events. */
export type RevolutSaleEvidence = {
  symbol: string;
  isin?: string;
  securityName?: string;
  country?: string;
  quantity: string;
  acquiredAt: string;
  soldAt: string;
  costBasis: string;
  grossProceeds: string;
  /** Revolut's gain in the TRADE currency. The German figure will differ. */
  grossPnl: string;
  currency: string;
};

const num = (v: string | undefined): string | undefined => {
  const n = cleanMoney(v);
  return n === null ? undefined : String(n);
};

/** ISO-8601 timestamp or Excel serial → `YYYY-MM-DD`. */
function toDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const serial = Number(raw);
  return Number.isFinite(serial) ? excelSerialToIso(serial) : undefined;
}

/**
 * Currency from the symbol embedded in an amount cell.
 *
 * Revolut writes UTF-8 currency signs that arrive mis-decoded: `€` becomes
 * `â_x0082_¬` and `£` becomes `Â£`. Detecting the symbol beats assuming the
 * sheet is euro-denominated, since savings pots exist in other currencies.
 */
export function currencyOfAmount(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (raw.includes("_x0082_") || raw.includes("€")) return "EUR";
  if (raw.includes("£")) return "GBP";
  if (raw.includes("$")) return "USD";
  return undefined;
}

/** True for a repeated header row — the savings sheet emits one at row 3. */
const isHeaderRow = (cells: Record<string, string>): boolean =>
  cells.A === "Date" || cells.B === "Description";

export function parseRevolutSavings(rows: SheetRow[], accountNumber: string): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];

  for (const { r, cells } of rows) {
    if (isHeaderRow(cells)) continue;
    const date = toDate(cells.A);
    const description = cells.B;
    if (!date || !description) continue;

    const moneyIn = cells.D;
    const moneyOut = cells.E;
    const currency = currencyOfAmount(moneyIn ?? moneyOut) ?? "EUR";

    // Interest: the AMOUNT is in "Money in". Column C is the APY rate and
    // must never reach a monetary field.
    if (/^net interest paid/i.test(description)) {
      const amount = num(moneyIn);
      if (!amount) continue;
      events.push({
        id: `revolut-savings-int-${r}`,
        broker: BROKER,
        accountNumber,
        type: "INTEREST",
        date,
        currency,
        description,
        amount,
        cashAmount: amount,
        source: "savings_statement",
      });
      continue;
    }

    const inAmount = num(moneyIn);
    const outAmount = num(moneyOut);
    if (inAmount === undefined && outAmount === undefined) continue;
    // `amount` and `cashAmount` must BOTH carry the sign. The dashboard cash
    // total sums CASH_TRANSFER.amount (data/dashboard.ts) and the FX layer
    // converts amount independently of cashAmount, so a positive amount on a
    // withdrawal would add it to cash instead of subtracting. IBKR and
    // Freedom keep the two identical and signed; match them.
    const signed = inAmount !== undefined ? inAmount : String(-Number(outAmount));

    events.push({
      id: `revolut-savings-cash-${r}`,
      broker: BROKER,
      accountNumber,
      type: "CASH_TRANSFER",
      date,
      currency,
      description,
      amount: signed,
      cashAmount: signed,
      source: "savings_statement",
    });
  }

  return events;
}

export function parseRevolutTrading(rows: SheetRow[], accountNumber: string): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];

  for (const { r, cells } of rows) {
    if (cells.A === "Date" || cells.C === "Type") continue;
    const date = toDate(cells.A);
    const type = cells.C;
    if (!date || !type) continue;

    const currency = cells.G ?? currencyOfAmount(cells.F) ?? "UNKNOWN";
    const amount = num(cells.F);
    const symbol = cells.B || undefined;

    // Dividends here are NET of withholding and in the trade currency. The
    // P&L statement reports the same payment gross with its WHT, which is
    // what §20 requires — emitting both would double-count.
    if (/dividend/i.test(type)) continue;

    if (/^(BUY|SELL)\b/i.test(type)) {
      const quantity = num(cells.D);
      if (!quantity) continue;
      // Numeric negation, not string concatenation — a source cell that
      // already carries a sign would otherwise yield "--0.4".
      const signed = /^SELL/i.test(type) ? String(-Math.abs(Number(quantity))) : quantity;
      events.push({
        id: `revolut-trade-${r}`,
        broker: BROKER,
        accountNumber,
        type: "TRADE",
        date,
        currency,
        symbol,
        description: type,
        quantity: signed,
        price: num(cells.E),
        amount,
        source: "trading_account_statement",
      });
      continue;
    }

    if (/fee/i.test(type)) {
      const absolute = amount ? String(Math.abs(Number(amount))) : undefined;
      events.push({
        id: `revolut-fee-${r}`,
        broker: BROKER,
        accountNumber,
        type: "FEE",
        date,
        currency,
        symbol,
        description: type,
        amount: absolute,
        fee: absolute,
        cashAmount: absolute ? String(-Number(absolute)) : undefined,
        source: "trading_account_statement",
      });
      continue;
    }

    events.push({
      id: `revolut-cash-${r}`,
      broker: BROKER,
      accountNumber,
      type: "CASH_TRANSFER",
      date,
      currency,
      description: type,
      amount,
      cashAmount: amount,
      source: "trading_account_statement",
    });
  }

  return events;
}

const SELLS_SECTION = /^income from sells/i;
const OTHER_SECTION = /^other income/i;

/**
 * Parse the two-section P&L workbook.
 *
 * Returns dividends as events and sells as evidence. The split is
 * deliberate: Revolut's `Gross PnL` is computed in the trade currency, but
 * §20 Abs. 4 requires each leg converted at its own ECB date rate, so our
 * engine must derive the German gain from the trades rather than adopt
 * Revolut's number.
 */
export function parseRevolutPnl(
  rows: SheetRow[],
  accountNumber: string,
): { sales: RevolutSaleEvidence[]; dividends: NormalizedEvent[] } {
  const sales: RevolutSaleEvidence[] = [];
  const dividends: NormalizedEvent[] = [];
  let section: "sells" | "other" | null = null;

  for (const { r, cells } of rows) {
    const first = cells.A ?? "";
    if (SELLS_SECTION.test(first)) { section = "sells"; continue; }
    if (OTHER_SECTION.test(first)) { section = "other"; continue; }
    if (first === "Date acquired" || first === "Date") continue; // section header
    if (!section) continue;

    if (section === "sells") {
      const acquiredAt = toDate(cells.A);
      const soldAt = toDate(cells.B);
      const quantity = num(cells.G);
      if (!acquiredAt || !soldAt || !quantity) continue;
      sales.push({
        symbol: cells.C ?? "",
        isin: cells.E || undefined,
        securityName: cells.D || undefined,
        country: cells.F || undefined,
        quantity,
        acquiredAt,
        soldAt,
        costBasis: num(cells.H) ?? "0",
        grossProceeds: num(cells.I) ?? "0",
        grossPnl: num(cells.J) ?? "0",
        currency: cells.K ?? "UNKNOWN",
      });
      continue;
    }

    const date = toDate(cells.A);
    const gross = num(cells.F);
    if (!date || gross === undefined) continue;
    dividends.push({
      id: `revolut-div-${r}`,
      broker: BROKER,
      accountNumber,
      type: "DIVIDEND",
      date,
      currency: cells.I ?? currencyOfAmount(cells.H) ?? "EUR",
      symbol: cells.B || undefined,
      isin: cells.D || undefined,
      name: cells.C || undefined,
      description: cells.C || "Dividend",
      amount: gross,
      withholdingTax: num(cells.G),
      source: "trading_pnl_statement",
    });
  }

  return { sales, dividends };
}
