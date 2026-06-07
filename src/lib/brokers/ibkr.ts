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
import type { BrokerAccountMetadata, NormalizedEvent, ParsedBrokerStatement, SnapshotQuote } from "./types";

type SectionRow = {
  section: string;
  values: Record<string, string>;
};

export type InstrumentInfo = {
  isin?: string;
  canonicalSymbol?: string;   // from FII "Underlying" column
  name?: string;              // from FII "Description" column
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
  // Prefer the Account Information field (e.g. "U13142092"). If that section
  // is missing — as it is on some Trade Confirmation exports — peel the
  // account id out of the filename (IBKR always names downloads like
  // `U13142092_2024_2024.csv`). Falling all the way through to "UNKNOWN"
  // would let two genuinely-different uploads collapse into one account,
  // or split one account across multiple rows, so we try hard to recover.
  // IBKR account ids are an uppercase U followed by 4+ digits. `\b` doesn't
  // help here because underscores in the filename count as word chars.
  const filenameAccount = fileName.match(/(?:^|[^A-Za-z0-9])(U\d{4,})(?:[^A-Za-z0-9]|$)/)?.[1];
  const accountNumber =
    getField(accountRows, "Account") ?? filenameAccount ?? "UNKNOWN";
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

  const instrumentMap = buildInstrumentMap(dataRows);
  const events = [
    ...parseTrades(dataRows, accountNumber, instrumentMap),
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
    ...parseCashReportEndings(dataRows, accountNumber, statementDates.endDate ?? `${taxYear}-12-31`),
    ...parseCashTransfers(dataRows, accountNumber),
    ...parseCorporateActions(dataRows, accountNumber, instrumentMap),
  ];

  const snapshotQuotes = parseIbkrSnapshotQuotes(dataRows, instrumentMap, statementDates.endDate);

  return { account, events, snapshotQuotes };
}

/**
 * Extract a spot-quote per currently-held position from IBKR's "Open
 * Positions / Summary" section. Mirrors the Freedom Finance path —
 * seeds quote_cache with the broker's own close prices on every
 * upload, so symbols our free quote chain can't reach (mid-caps like
 * RBRK, EU UCITS ETFs) still render with a usable price.
 *
 * Skips Total/SubTotal rows (DataDiscriminator !== "Summary"), applies
 * the FII canonical-symbol remap (so TRNl is stored as TRN), and
 * filters out rows with no usable close price.
 */
function parseIbkrSnapshotQuotes(
  dataRows: SectionRow[],
  instrumentMap: Map<string, InstrumentInfo>,
  endDate: string | undefined,
): SnapshotQuote[] {
  if (!endDate) return [];
  const out: SnapshotQuote[] = [];
  for (const row of getRows(dataRows, "Open Positions")) {
    if (row["DataDiscriminator"] !== "Summary") continue;
    const rawSymbol = cleanString(row["Symbol"]);
    if (!rawSymbol) continue;
    const info = instrumentMap.get(stripBondYieldSuffix(rawSymbol)) ?? instrumentMap.get(rawSymbol);
    const symbol = info?.canonicalSymbol ?? stripBondYieldSuffix(rawSymbol);
    const closeStr = cleanNumber(row["Close Price"]);
    if (!closeStr) continue;
    const num = Number(closeStr);
    if (!Number.isFinite(num) || num <= 0) continue;
    const currency = cleanString(row["Currency"]) ?? "USD";
    out.push({ symbol, date: endDate, close: num.toFixed(4), currency, source: "IBKR_SNAPSHOT" });
  }
  return out;
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

function stripBondYieldSuffix(s: string): string {
  // Strip trailing " 4.52262213%" from bond names like "T 4 5/8 09/15/26 4.52262213%"
  return s.replace(/\s+\d+(\.\d+)?%$/, "").trim();
}

function buildInstrumentMap(rows: SectionRow[]): Map<string, InstrumentInfo> {
  const map = new Map<string, InstrumentInfo>();
  for (const fii of getRows(rows, "Financial Instrument Information")) {
    const isin = cleanString(fii["Security ID"] ?? fii.ISIN ?? fii.Isin);
    const underlying = cleanString(fii.Underlying);
    const description = cleanString(fii.Description);
    if (!isin && !underlying && !description) continue;
    const info: InstrumentInfo = { isin, canonicalSymbol: underlying, name: description };

    // Index by every symbol variant in the Symbol column (comma-separated alias list)
    const rawSymbol = cleanString(fii.Symbol) ?? "";
    for (const alias of rawSymbol.split(",").map(s => s.trim()).filter(Boolean)) {
      map.set(alias, info);
      const stripped = stripBondYieldSuffix(alias);
      if (stripped !== alias) map.set(stripped, info);
    }
    if (underlying) {
      map.set(underlying, info);
    }
    if (description) {
      map.set(description, info);
      const stripped = stripBondYieldSuffix(description);
      if (stripped !== description) map.set(stripped, info);
    }
  }
  return map;
}

function parseTrades(rows: SectionRow[], accountNumber: string, instrumentMap: Map<string, InstrumentInfo>): NormalizedEvent[] {
  return getRows(rows, "Trades")
    .flatMap<NormalizedEvent>((row, index) => {
      const date = dateOnly(row["Date/Time"]);
      const fee = absoluteNumber(row["Comm/Fee"]);
      const proceeds = cleanNumber(row.Proceeds);
      const cashAmount = subtractNumbers(proceeds, fee);
      const assetCategory = cleanString(row["Asset Category"]) ?? "";
      const rawSymbol = cleanString(row.Symbol);
      const info = rawSymbol
        ? (instrumentMap.get(stripBondYieldSuffix(rawSymbol)) ?? instrumentMap.get(rawSymbol))
        : undefined;
      const isin = info?.isin;
      const canonical = info?.canonicalSymbol;
      const name = info?.name;
      const symbol = canonical ?? (rawSymbol ? stripBondYieldSuffix(rawSymbol) : undefined);

      if (assetCategory.toLowerCase().startsWith("forex")) {
        // A Forex row is a paired conversion: quote-currency proceeds (e.g.
        // USD) AND base-currency quantity (e.g. EUR from "EUR.USD"). Emit
        // both legs so cash balances net out correctly across currencies —
        // otherwise we double-debit one side without crediting the other.
        const quoteCurrency = cleanString(row.Currency) ?? "UNKNOWN";
        const [baseCurrency = "UNKNOWN"] = (rawSymbol ?? "").split(".");
        const quantity = cleanNumber(row.Quantity);
        const quoteLeg = withTaxReview(compactEvent<NormalizedEvent>({
          id: `ibkr-fx-${index + 1}-quote`,
          broker: "INTERACTIVE_BROKERS",
          accountNumber,
          type: "FX_CONVERSION",
          date,
          currency: quoteCurrency,
          description: rawSymbol,
          amount: proceeds,
          cashAmount,
          proceeds,
          fee,
          source: "Forex",
        }));
        const baseLeg = withTaxReview(compactEvent<NormalizedEvent>({
          id: `ibkr-fx-${index + 1}-base`,
          broker: "INTERACTIVE_BROKERS",
          accountNumber,
          type: "FX_CONVERSION",
          date,
          currency: baseCurrency,
          description: rawSymbol,
          amount: quantity,
          cashAmount: quantity,
          source: "Forex",
        }));
        return [quoteLeg, baseLeg];
      }

      return [withTaxReview(compactEvent<NormalizedEvent>({
        id: `ibkr-trade-${index + 1}`,
        broker: "INTERACTIVE_BROKERS",
        accountNumber,
        type: "TRADE",
        date,
        currency: cleanString(row.Currency) ?? "UNKNOWN",
        symbol,
        isin,
        name,
        description: cleanString(row.DataDiscriminator),
        quantity: cleanNumber(row.Quantity),
        price: cleanNumber(row["T. Price"]),
        amount: proceeds,
        cashAmount,
        proceeds,
        fee,
        realizedPnl: cleanNumber(row["Realized P/L"]),
        source: "Trades",
      }))];
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

/**
 * Capture IBKR's authoritative per-currency "Ending Settled Cash" from the
 * statement's Cash Report. Emitted as CASH_TRANSFER events with a special
 * `source = "CASH_REPORT_ENDING"` marker the cash accessor recognizes and
 * uses as a snapshot, bypassing event-summing for that currency.
 *
 * Why: IBKR's Cash Report includes adjustments we can't reconstruct from
 * raw events (UK stamp tax, FX translation gain/loss, transfer-day timing
 * quirks). Trusting the broker's own per-currency total is more robust
 * than trying to enumerate every fee class.
 */
function parseCashReportEndings(
  rows: SectionRow[],
  accountNumber: string,
  statementEndDate: string,
): NormalizedEvent[] {
  return getRows(rows, "Cash Report")
    .filter((row) => {
      const summary = String(row["Currency Summary"] ?? "");
      const currency = cleanString(row.Currency) ?? "";
      // Take "Ending Settled Cash" per-currency rows; skip "Base Currency
      // Summary" aggregates (those are EUR-equivalent totals, not native).
      return summary === "Ending Settled Cash" && currency !== "" && currency !== "Base Currency Summary";
    })
    .map((row, index) =>
      compactEvent<NormalizedEvent>({
        id: `ibkr-cash-snapshot-${index + 1}`,
        broker: "INTERACTIVE_BROKERS",
        accountNumber,
        type: "CASH_TRANSFER",
        date: statementEndDate,
        currency: cleanString(row.Currency) ?? "UNKNOWN",
        description: "Ending Settled Cash",
        amount: cleanNumber(row.Total),
        cashAmount: cleanNumber(row.Total),
        source: "CASH_REPORT_ENDING",
      }),
    )
    .filter((event) => Boolean(event.amount));
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

function parseCorporateActions(rows: SectionRow[], accountNumber: string, instrumentMap: Map<string, InstrumentInfo>): NormalizedEvent[] {
  return getRows(rows, "Corporate Actions")
    .map((row, index) => {
      const date = dateOnly(row.Date ?? row["Date/Time"]);
      const rawSymbol = cleanString(row.Symbol);
      const info = rawSymbol
        ? (instrumentMap.get(stripBondYieldSuffix(rawSymbol)) ?? instrumentMap.get(rawSymbol))
        : undefined;
      const isin = info?.isin;
      const canonical = info?.canonicalSymbol;
      const name = info?.name;
      const symbol = canonical ?? (rawSymbol ? stripBondYieldSuffix(rawSymbol) : undefined);

      return compactEvent<NormalizedEvent>({
        id: `ibkr-corporate-action-${index + 1}`,
        broker: "INTERACTIVE_BROKERS",
        accountNumber,
        type: "CORPORATE_ACTION",
        date,
        currency: cleanString(row.Currency) ?? "UNKNOWN",
        symbol,
        isin,
        name,
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
