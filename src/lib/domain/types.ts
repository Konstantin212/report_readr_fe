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
  /**
   * Broker-declared instrument kind, when the statement carries it.
   * Freedom24 tags every trade row with `instr_kind` (e.g. "фонд/ETF"
   * = fund/ETF, "акция обыкновенная" = common stock); IBKR's Financial
   * Instrument Information may carry an asset type. Persisted onto
   * `instruments.kind` at ingest and consulted by the classification
   * layer AHEAD of the hardcoded symbol maps — broker data beats
   * guesses (a missing KIND_MAP entry mis-filed SCHD as a stock).
   */
  instrumentKind?: "stock" | "etf" | "bond" | "other";
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

/**
 * A spot-quote snapshot for a single symbol, captured from a broker
 * statement at upload time (e.g. Freedom24's `account_at_end.positions_from_ts`
 * or IBKR's Open Positions section). Used to seed `quote_cache` so
 * symbols our free API providers can't reach (UCITS ETFs, broker-specific
 * aliases like RY4C, mid-caps like RBRK) still render with a usable price.
 *
 * Each broker parser stamps `source` with its own provider tag
 * (`FREEDOM_SNAPSHOT`, `IBKR_SNAPSHOT`, ...) so the ingest path doesn't
 * need to know which broker the quotes came from.
 *
 * Live API quotes always carry a later date than the statement, so the
 * orchestrator's "latest by date" pick prefers them when present.
 */
export type SnapshotQuote = {
  symbol: string;
  /** ISO YYYY-MM-DD — usually the statement end date. */
  date: string;
  close: string;
  currency: string;
  /** Provider tag stored in quote_cache.source. */
  source: string;
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
   *  Each entry carries its own `source` tag so the ingest endpoint
   *  knows which provider to record in quote_cache. */
  snapshotQuotes?: SnapshotQuote[];
};
