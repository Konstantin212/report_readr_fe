import {
  absoluteNumber,
  cleanNumber,
  cleanString,
  compactEvent,
  dateOnly,
  decodeBytes,
  negateNumber,
  signedQuantity,
  subtractNumbers,
} from "./format";
import type { BrokerAccountMetadata, NormalizedEvent, ParsedBrokerStatement } from "./types";

type FreedomStatement = {
  date_start?: unknown;
  date_end?: unknown;
  plainAccountInfoData?: {
    account?: unknown;
    account_id?: unknown;
    currency?: unknown;
  };
  accountInfo?: {
    account?: unknown;
    account_id?: unknown;
    currency?: unknown;
  };
  trades?: {
    detailed?: FreedomTrade[];
  };
  cash_flows?: {
    detailed?: FreedomCashFlow[];
  };
  commissions?: {
    detailed?: FreedomCommission[];
  };
  corporate_actions?: {
    detailed?: FreedomCorporateAction[];
  };
};

type FreedomTrade = Record<string, unknown> & {
  id?: unknown;
  date?: unknown;
  instr_nm?: unknown;
  isin?: unknown;
  operation?: unknown;
  curr_c?: unknown;
  q?: unknown;
  p?: unknown;
  summ?: unknown;
  profit?: unknown;
  commission?: unknown;
  commission_currency?: unknown;
};

type FreedomCashFlow = Record<string, unknown> & {
  id?: unknown;
  date?: unknown;
  instr_nm?: unknown;
  operation?: unknown;
  curr_c?: unknown;
  summ?: unknown;
  withholding_tax?: unknown;
};

type FreedomCommission = Record<string, unknown> & {
  id?: unknown;
  date?: unknown;
  curr_c?: unknown;
  summ?: unknown;
};

type FreedomCorporateAction = Record<string, unknown> & {
  id?: unknown;
  date?: unknown;
  instr_nm?: unknown;
  isin?: unknown;
  operation?: unknown;
  curr_c?: unknown;
  q?: unknown;
  summ?: unknown;
};

export function parseFreedomFinanceStatement(
  fileName: string,
  bytes: Uint8Array | ArrayBuffer,
  taxYear: number,
): ParsedBrokerStatement {
  const statement = JSON.parse(decodeBytes(bytes)) as FreedomStatement;
  const accountInfo = statement.plainAccountInfoData ?? statement.accountInfo ?? {};
  const accountNumber =
    cleanString(accountInfo.account) ?? cleanString(accountInfo.account_id) ?? fileName.replace(/\W+/g, "-");

  const account: BrokerAccountMetadata = {
    broker: "FREEDOM_FINANCE",
    accountNumber,
    baseCurrency: cleanString(accountInfo.currency),
    statementStartDate: dateOnly(statement.date_start) || undefined,
    statementEndDate: dateOnly(statement.date_end) || undefined,
    fileName,
    taxYear,
  };

  const events = [
    ...parseTrades(statement.trades?.detailed ?? [], accountNumber),
    ...parseCashFlows(statement.cash_flows?.detailed ?? [], accountNumber),
    ...parseCommissions(statement.commissions?.detailed ?? [], accountNumber),
    ...parseCorporateActions(statement.corporate_actions?.detailed ?? [], accountNumber),
  ];

  return { account, events };
}

function parseTrades(rows: FreedomTrade[], accountNumber: string): NormalizedEvent[] {
  return rows
    .map((row, index) => {
      const date = dateOnly(row.date);
      const operation = cleanString(row.operation);
      const quantity = signedQuantity(row.q, operation);
      const fee = absoluteNumber(row.commission);
      const amount = cleanNumber(row.summ);

      return withTaxReview(compactEvent<NormalizedEvent>({
        id: cleanString(row.id) ?? `freedom-trade-${index + 1}`,
        broker: "FREEDOM_FINANCE",
        accountNumber,
        type: "TRADE",
        date,
        currency: cleanString(row.curr_c) ?? "UNKNOWN",
        symbol: cleanString(row.instr_nm),
        isin: cleanString(row.isin),
        description: operation,
        quantity,
        price: cleanNumber(row.p),
        amount,
        cashAmount: subtractNumbers(amount, fee),
        proceeds: amount,
        realizedPnl: cleanNumber(row.profit),
        fee,
        source: "trades.detailed",
      }));
    })
    .filter((event) => Boolean(event.date));
}

function parseCashFlows(rows: FreedomCashFlow[], accountNumber: string): NormalizedEvent[] {
  return rows
    .map((row, index) => {
      const operation = cleanString(row.operation)?.toLowerCase() ?? "";
      const eventType = operation.includes("dividend") ? "DIVIDEND" : "CASH_TRANSFER";
      const amount = cleanNumber(row.summ);
      const withholdingTax = absoluteNumber(row.withholding_tax);

      return withTaxReview(compactEvent<NormalizedEvent>({
        id: cleanString(row.id) ?? `freedom-cash-flow-${index + 1}`,
        broker: "FREEDOM_FINANCE",
        accountNumber,
        type: eventType,
        date: dateOnly(row.date),
        currency: cleanString(row.curr_c) ?? "UNKNOWN",
        symbol: cleanString(row.instr_nm),
        description: cleanString(row.operation) ?? cleanString(row.instr_nm),
        amount,
        cashAmount: eventType === "DIVIDEND" ? subtractNumbers(amount, withholdingTax) : amount,
        withholdingTax,
        source: "cash_flows.detailed",
      }));
    })
    .filter((event) => Boolean(event.date));
}

function parseCommissions(rows: FreedomCommission[], accountNumber: string): NormalizedEvent[] {
  return rows
    .map((row, index) =>
      withTaxReview(compactEvent<NormalizedEvent>({
        id: cleanString(row.id) ?? `freedom-fee-${index + 1}`,
        broker: "FREEDOM_FINANCE",
        accountNumber,
        type: "FEE",
        date: dateOnly(row.date),
        currency: cleanString(row.curr_c) ?? "UNKNOWN",
        amount: cleanNumber(row.summ),
        fee: absoluteNumber(row.summ),
        cashAmount: negateNumber(absoluteNumber(row.summ)),
        source: "commissions.detailed",
      })),
    )
    .filter((event) => Boolean(event.date));
}

function parseCorporateActions(rows: FreedomCorporateAction[], accountNumber: string): NormalizedEvent[] {
  return rows
    .map((row, index) =>
      compactEvent<NormalizedEvent>({
        id: cleanString(row.id) ?? `freedom-corporate-action-${index + 1}`,
        broker: "FREEDOM_FINANCE",
        accountNumber,
        type: "CORPORATE_ACTION",
        date: dateOnly(row.date),
        currency: cleanString(row.curr_c) ?? "UNKNOWN",
        symbol: cleanString(row.instr_nm),
        isin: cleanString(row.isin),
        description: cleanString(row.operation),
        quantity: cleanNumber(row.q),
        amount: cleanNumber(row.summ),
        source: "corporate_actions.detailed",
      }),
    )
    .filter((event) => Boolean(event.date));
}

function withTaxReview(event: NormalizedEvent): NormalizedEvent {
  if (event.currency === "EUR") {
    return {
      ...event,
      amountEur: event.amount,
      proceedsEur: event.proceeds,
      realizedPnlEur: event.realizedPnl,
      feeEur: event.fee,
      withholdingTaxEur: event.withholdingTax,
      cashAmountEur: event.cashAmount,
      fxSource: "BROKER",
    };
  }

  const needsTaxReview =
    (event.type === "TRADE" && event.realizedPnl !== undefined) ||
    ((event.type === "DIVIDEND" || event.type === "INTEREST") && event.amount !== undefined) ||
    (event.type === "WITHHOLDING_TAX" && event.withholdingTax !== undefined);

  return needsTaxReview ? { ...event, fxSource: "MISSING", requiresReview: true } : event;
}
