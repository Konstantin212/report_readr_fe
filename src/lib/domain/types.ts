export type Broker = "INTERACTIVE_BROKERS" | "FREEDOM_FINANCE" | "COINBASE";

export type EventType =
  | "TRADE"
  | "DIVIDEND"
  | "INTEREST"
  | "FEE"
  | "WITHHOLDING_TAX"
  | "FX_CONVERSION"
  | "CASH_TRANSFER"
  | "CORPORATE_ACTION"
  | "POSITION_SNAPSHOT"
  | "CRYPTO_STAKE_REWARD"
  | "CRYPTO_BUY"
  | "CRYPTO_SELL";

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
  name?: string;
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
  /**
   * Currency of the `fee` field when it differs from `currency`.
   * Freedom Finance reports commissions in the account base currency
   * (EUR) while the trade itself is in USD — without this, FX would
   * mis-convert an already-EUR fee. Absent → fee uses `currency`.
   */
  feeCurrency?: string;
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

export type SnapshotQuote = {
  symbol: string;
  date: string;
  close: string;
  currency: string;
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
  /** Optional broker-end-of-statement spot prices for held positions.
   *  Used to seed quote_cache for symbols our free providers can't
   *  reach (UCITS ETFs on Amsterdam/Frankfurt, Freedom aliases like
   *  RY4C). The ingest endpoint upserts these into quote_cache with
   *  source = "FREEDOM_SNAPSHOT". */
  snapshotQuotes?: SnapshotQuote[];
};
