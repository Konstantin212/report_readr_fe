export type Broker = "INTERACTIVE_BROKERS" | "FREEDOM_FINANCE";

export type EventType =
  | "TRADE"
  | "DIVIDEND"
  | "INTEREST"
  | "FEE"
  | "WITHHOLDING_TAX"
  | "FX_CONVERSION"
  | "CASH_TRANSFER"
  | "CORPORATE_ACTION"
  | "POSITION_SNAPSHOT";

export type NormalizedEvent = {
  id: string;
  broker: Broker;
  accountNumber: string;
  type: EventType;
  date: string;
  currency: string;
  source?: string;
  symbol?: string;
  isin?: string;
  description?: string;
  quantity?: string;
  price?: string;
  amount?: string;
  amountEur?: string;
  cashAmount?: string;
  cashAmountEur?: string;
  proceeds?: string;
  proceedsEur?: string;
  realizedPnl?: string;
  realizedPnlEur?: string;
  fee?: string;
  feeEur?: string;
  withholdingTax?: string;
  withholdingTaxEur?: string;
  fxSource?: "BROKER" | "ECB" | "MANUAL_REVIEW" | "MISSING";
  requiresReview?: boolean;
  reviewedAt?: string;
  reviewedByUserId?: string;
  reviewNote?: string;
  importedAt?: string;
};

export type ParsedAccount = {
  broker: Broker;
  accountNumber: string;
  baseCurrency?: string;
  displayName?: string;
};

export type ParsedImport = {
  broker: Broker;
  fileName: string;
  taxYear: number;
  account: ParsedAccount;
  events: NormalizedEvent[];
  importedAt?: string;
  statementStartDate?: string;
  statementEndDate?: string;
};
