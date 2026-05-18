import { parseCsv } from "./csv";
import {
  absoluteNumber,
  cleanNumber,
  cleanString,
  compactEvent,
  dateOnly,
  decodeBytes,
  negateNumber,
  subtractNumbers,
} from "./format";
import type { BrokerAccountMetadata, NormalizedEvent, ParsedBrokerStatement } from "./types";

type SectionRow = {
  section: string;
  values: Record<string, string>;
};

export function parseInteractiveBrokersStatement(
  fileName: string,
  bytes: Uint8Array | ArrayBuffer,
  taxYear: number,
): ParsedBrokerStatement {
  const rows = parseCsv(decodeBytes(bytes));
  const headersBySection = new Map<string, string[]>();
  const dataRows: SectionRow[] = [];

  for (const row of rows) {
    const [section, kind, ...rest] = row;

    if (!section || !kind) {
      continue;
    }

    if (kind === "Header") {
      headersBySection.set(section, rest.map((value) => value.trim()));
      continue;
    }

    if (kind !== "Data") {
      continue;
    }

    const headers = headersBySection.get(section) ?? [];
    dataRows.push({
      section,
      values: Object.fromEntries(headers.map((header, index) => [header, rest[index] ?? ""])),
    });
  }

  const statementRows = getRows(dataRows, "Statement");
  const accountRows = getRows(dataRows, "Account Information");
  const accountNumber = getField(accountRows, "Account") ?? "UNKNOWN";
  const statementPeriod = getField(statementRows, "Period");
  const statementDates = parseStatementPeriod(statementPeriod);

  const account: BrokerAccountMetadata = {
    broker: "INTERACTIVE_BROKERS",
    brokerName: getField(statementRows, "BrokerName"),
    accountNumber,
    baseCurrency: getField(accountRows, "Base Currency"),
    statementPeriod,
    statementStartDate: statementDates.startDate,
    statementEndDate: statementDates.endDate,
    fileName,
    taxYear,
  };

  const events = [
    ...parseTrades(dataRows, accountNumber),
    ...parseSimpleAmountSection(dataRows, {
      accountNumber,
      section: "Dividends",
      eventType: "DIVIDEND",
      idPrefix: "ibkr-dividend",
    }),
    ...parseSimpleAmountSection(dataRows, {
      accountNumber,
      section: "Interest",
      eventType: "INTEREST",
      idPrefix: "ibkr-interest",
    }),
    ...parseCashReportFees(dataRows, accountNumber, statementDates.endDate ?? `${taxYear}-12-31`),
    ...parseCashTransfers(dataRows, accountNumber),
    ...parseCorporateActions(dataRows, accountNumber),
  ];

  return { account, events };
}

function getRows(rows: SectionRow[], section: string): Record<string, string>[] {
  return rows.filter((row) => row.section === section).map((row) => row.values);
}

function getField(rows: Record<string, string>[], fieldName: string): string | undefined {
  const keyValueRow = rows.find((row) => cleanString(row["Field Name"]) === fieldName);
  if (keyValueRow) {
    return cleanString(keyValueRow["Field Value"]);
  }

  return cleanString(rows.find((row) => cleanString(row[fieldName]))?.[fieldName]);
}

function parseTrades(rows: SectionRow[], accountNumber: string): NormalizedEvent[] {
  return getRows(rows, "Trades")
    .map((row, index) => {
      const date = dateOnly(row["Date/Time"]);
      const fee = absoluteNumber(row["Comm/Fee"]);
      const proceeds = cleanNumber(row.Proceeds);
      const cashAmount = subtractNumbers(proceeds, fee);

      return withTaxReview(compactEvent<NormalizedEvent>({
        id: `ibkr-trade-${index + 1}`,
        broker: "INTERACTIVE_BROKERS",
        accountNumber,
        type: "TRADE",
        date,
        currency: cleanString(row.Currency) ?? "UNKNOWN",
        symbol: cleanString(row.Symbol),
        description: cleanString(row.DataDiscriminator),
        quantity: cleanNumber(row.Quantity),
        price: cleanNumber(row["T. Price"]),
        amount: proceeds,
        cashAmount,
        proceeds,
        fee,
        realizedPnl: cleanNumber(row["Realized P/L"]),
        source: "Trades",
      }));
    })
    .filter((event) => Boolean(event.date));
}

function parseSimpleAmountSection(
  rows: SectionRow[],
  options: {
    accountNumber: string;
    section: string;
    eventType: "DIVIDEND" | "INTEREST" | "FEE";
    idPrefix: string;
  },
): NormalizedEvent[] {
  return getRows(rows, options.section)
    .filter((row) => cleanString(row.Date))
    .map((row, index) => {
      const date = dateOnly(row.Date);

      return withTaxReview(compactEvent<NormalizedEvent>({
        id: `${options.idPrefix}-${index + 1}`,
        broker: "INTERACTIVE_BROKERS",
        accountNumber: options.accountNumber,
        type: options.eventType,
        date,
        currency: cleanString(row.Currency) ?? "UNKNOWN",
        description: cleanString(row.Description),
        amount: options.eventType === "FEE" ? absoluteNumber(row.Amount) : cleanNumber(row.Amount),
        cashAmount:
          options.eventType === "FEE" ? negateNumber(absoluteNumber(row.Amount)) : cleanNumber(row.Amount),
        source: options.section,
      }));
    })
    .filter((event) => Boolean(event.date));
}

function parseCashReportFees(
  rows: SectionRow[],
  accountNumber: string,
  statementEndDate: string,
): NormalizedEvent[] {
  return getRows(rows, "Cash Report")
    .filter((row) => String(row["Currency Summary"] ?? "").toLowerCase().includes("commission"))
    .map((row, index) =>
      withTaxReview(compactEvent<NormalizedEvent>({
        id: `ibkr-fee-${index + 1}`,
        broker: "INTERACTIVE_BROKERS",
        accountNumber,
        type: "FEE",
        date: statementEndDate,
        currency: cleanString(row.Currency?.replace("Base Currency Summary", "")) ?? "BASE",
        description: cleanString(row["Currency Summary"]),
        amount: absoluteNumber(row.Total),
        fee: absoluteNumber(row.Total),
        cashAmount: negateNumber(absoluteNumber(row.Total)),
        source: "Cash Report",
      })),
    );
}

function parseCashTransfers(rows: SectionRow[], accountNumber: string): NormalizedEvent[] {
  return getRows(rows, "Deposits & Withdrawals")
    .map((row, index) => {
      const date = dateOnly(row["Settle Date"] ?? row.Date);

      return compactEvent<NormalizedEvent>({
        id: `ibkr-cash-transfer-${index + 1}`,
        broker: "INTERACTIVE_BROKERS",
        accountNumber,
        type: "CASH_TRANSFER",
        date,
        currency: cleanString(row.Currency) ?? "UNKNOWN",
        description: cleanString(row.Description),
        amount: cleanNumber(row.Amount),
        cashAmount: cleanNumber(row.Amount),
        source: "Deposits & Withdrawals",
      });
    })
    .filter((event) => Boolean(event.date));
}

function parseCorporateActions(rows: SectionRow[], accountNumber: string): NormalizedEvent[] {
  return getRows(rows, "Corporate Actions")
    .map((row, index) => {
      const date = dateOnly(row.Date ?? row["Date/Time"]);

      return compactEvent<NormalizedEvent>({
        id: `ibkr-corporate-action-${index + 1}`,
        broker: "INTERACTIVE_BROKERS",
        accountNumber,
        type: "CORPORATE_ACTION",
        date,
        currency: cleanString(row.Currency) ?? "UNKNOWN",
        symbol: cleanString(row.Symbol),
        description: cleanString(row.Description ?? row.Action),
        quantity: cleanNumber(row.Quantity),
        amount: cleanNumber(row.Amount),
        source: "Corporate Actions",
      });
    })
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

function parseStatementPeriod(period: string | undefined): { startDate?: string; endDate?: string } {
  if (!period) {
    return {};
  }

  const [start, end] = period.split(/\s+-\s+/);
  return {
    startDate: parseEnglishDate(start),
    endDate: parseEnglishDate(end),
  };
}

function parseEnglishDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = value.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (!match) {
    return dateOnly(value) || undefined;
  }

  const monthName = match[1];
  const day = match[2];
  const year = match[3];
  if (!monthName || !day || !year) {
    return undefined;
  }

  const month = MONTHS[monthName.toLowerCase()];
  if (!month) {
    return undefined;
  }

  return `${year}-${month}-${day.padStart(2, "0")}`;
}

const MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};
