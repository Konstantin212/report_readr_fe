/**
 * Shared synthetic-row builders for the §10-TAX correctness tests (T2a/T4/T5).
 *
 * These construct the minimal `transactions` / `realizedMatches` /
 * `brokerAccounts` shapes that `buildKapInputs` reads, cast to the drizzle
 * row types. No DB — the loaders under test are pure once the rows are in
 * memory (repo convention: pure-function tests only).
 */
import { buildKapInputs, deriveAccountScope } from "@/lib/tax/kap-inputs";
import type { transactions, realizedMatches, brokerAccounts, userSettings } from "@/lib/db/schema";
import type { BuildAnlageKapInput } from "@/lib/tax/german-tax";

type TxRow = typeof transactions.$inferSelect;
type MatchRow = typeof realizedMatches.$inferSelect;
type AccountRow = typeof brokerAccounts.$inferSelect;

export const ACCT = {
  ff: "acct-ff",
  ibkr: "acct-ibkr",
  coinbase: "acct-coinbase",
} as const;

export function accounts(): AccountRow[] {
  return [
    { id: ACCT.ff, broker: "FREEDOM_FINANCE" } as AccountRow,
    { id: ACCT.ibkr, broker: "INTERACTIVE_BROKERS" } as AccountRow,
    { id: ACCT.coinbase, broker: "COINBASE" } as AccountRow,
  ];
}

export function dividend(o: {
  brokerAccountId: string;
  symbol: string;
  isin?: string;
  amountEur: string;
  whtEur?: string;
  date?: string;
  source?: string;
}): TxRow {
  return {
    eventType: "DIVIDEND",
    eventDate: o.date ?? "2025-06-01",
    brokerAccountId: o.brokerAccountId,
    symbol: o.symbol,
    isin: o.isin ?? null,
    amountEur: o.amountEur,
    withholdingTaxEur: o.whtEur ?? "0",
    source: o.source ?? null,
  } as unknown as TxRow;
}

export function withholdingTax(o: {
  brokerAccountId: string;
  symbol: string;
  isin?: string;
  whtEur: string;
  date?: string;
}): TxRow {
  return {
    eventType: "WITHHOLDING_TAX",
    eventDate: o.date ?? "2025-06-01",
    brokerAccountId: o.brokerAccountId,
    symbol: o.symbol,
    isin: o.isin ?? null,
    withholdingTaxEur: o.whtEur,
    amountEur: o.whtEur,
    source: null,
  } as unknown as TxRow;
}

export function interest(o: { brokerAccountId: string; amountEur: string; date?: string }): TxRow {
  return {
    eventType: "INTEREST",
    eventDate: o.date ?? "2025-06-01",
    brokerAccountId: o.brokerAccountId,
    symbol: null,
    isin: null,
    amountEur: o.amountEur,
    withholdingTaxEur: "0",
    source: null,
  } as unknown as TxRow;
}

export function match(o: {
  brokerAccountId: string;
  symbol: string;
  gainEur: string;
  closedAt?: string;
}): MatchRow {
  return {
    brokerAccountId: o.brokerAccountId,
    symbol: o.symbol,
    gainEur: o.gainEur,
    closedAt: o.closedAt ?? "2025-07-01",
  } as unknown as MatchRow;
}

const SETTINGS = { filingStatus: "SINGLE", saverAllowance: "1000" } as unknown as typeof userSettings.$inferSelect;

/** Run the full tax.ts KAP assembly (account scope + WHT + broker tags +
 *  classification threading) exactly as getTaxData would, minus the DB. */
export function buildInputs(
  tx: TxRow[],
  matches: MatchRow[],
  classification: BuildAnlageKapInput["classification"] = {},
  accountRows: AccountRow[] = accounts(),
): BuildAnlageKapInput {
  const { stockAccountIds, brokerById } = deriveAccountScope(accountRows);
  return buildKapInputs(2025, SETTINGS, tx, matches, stockAccountIds, brokerById, classification ?? {});
}
