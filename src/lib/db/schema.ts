import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const brokerEnum = pgEnum("broker", ["INTERACTIVE_BROKERS", "FREEDOM_FINANCE"]);
export const eventTypeEnum = pgEnum("event_type", [
  "TRADE",
  "DIVIDEND",
  "INTEREST",
  "FEE",
  "WITHHOLDING_TAX",
  "FX_CONVERSION",
  "CASH_TRANSFER",
  "CORPORATE_ACTION",
  "POSITION_SNAPSHOT",
]);

/**
 * Email allowlist for the private app. Only emails in this table (plus
 * the AUTHORIZED_EMAILS env var, which is kept as a bootstrap fallback)
 * can complete the OAuth sign-up flow. Managed via the Settings page by
 * the admin user — see lib/auth/admin.ts for the admin-email check.
 */
export const allowedEmails = pgTable("allowed_emails", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  note: text("note"),
  addedAt: timestamp("added_at").notNull().defaultNow(),
  addedByUserId: text("added_by_user_id").references(() => user.id, { onDelete: "set null" }),
});

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const brokerAccounts = pgTable(
  "broker_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    broker: brokerEnum("broker").notNull(),
    accountNumber: text("account_number").notNull(),
    baseCurrency: text("base_currency").notNull().default("EUR"),
    displayName: text("display_name"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    ownerAccountUnique: uniqueIndex("broker_accounts_owner_account_unique").on(
      table.ownerUserId,
      table.broker,
      table.accountNumber,
    ),
  }),
);

export const imports = pgTable(
  "imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    brokerAccountId: uuid("broker_account_id").references(() => brokerAccounts.id, { onDelete: "cascade" }),
    broker: brokerEnum("broker").notNull(),
    fileName: text("file_name").notNull(),
    fileHash: text("file_hash").notNull(),
    taxYear: integer("tax_year").notNull(),
    eventCount: integer("event_count").notNull(),
    insertedEventCount: integer("inserted_event_count").notNull().default(0),
    duplicateEventCount: integer("duplicate_event_count").notNull().default(0),
    statementStartDate: text("statement_start_date"),
    statementEndDate: text("statement_end_date"),
    status: text("status").notNull().default("PARSED"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    ownerHashUnique: uniqueIndex("imports_owner_hash_unique").on(table.ownerUserId, table.fileHash),
  }),
);

export const instruments = pgTable(
  "instruments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    symbol: text("symbol"),
    isin: text("isin"),
    name: text("name"),
    currency: text("currency"),
  },
  (table) => ({
    ownerIsinIndex: index("instruments_owner_isin_idx").on(table.ownerUserId, table.isin),
    ownerIsinUnique: uniqueIndex("instruments_owner_isin_unique").on(table.ownerUserId, table.isin),
  }),
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    importId: uuid("import_id").references(() => imports.id, { onDelete: "cascade" }),
    brokerAccountId: uuid("broker_account_id").references(() => brokerAccounts.id, { onDelete: "cascade" }),
    broker: brokerEnum("broker").notNull(),
    accountNumber: text("account_number").notNull(),
    eventFingerprint: text("event_fingerprint").notNull(),
    eventType: eventTypeEnum("event_type").notNull(),
    eventDate: text("event_date").notNull(),
    currency: text("currency").notNull(),
    symbol: text("symbol"),
    isin: text("isin"),
    quantity: numeric("quantity"),
    price: numeric("price"),
    amount: numeric("amount"),
    amountEur: numeric("amount_eur"),
    cashAmount: numeric("cash_amount"),
    cashAmountEur: numeric("cash_amount_eur"),
    proceeds: numeric("proceeds"),
    proceedsEur: numeric("proceeds_eur"),
    fee: numeric("fee"),
    feeEur: numeric("fee_eur"),
    realizedPnl: numeric("realized_pnl"),
    realizedPnlEur: numeric("realized_pnl_eur"),
    withholdingTax: numeric("withholding_tax"),
    withholdingTaxEur: numeric("withholding_tax_eur"),
    fxSource: text("fx_source"),
    requiresReview: boolean("requires_review").notNull().default(false),
    reviewedAt: timestamp("reviewed_at"),
    reviewedByUserId: text("reviewed_by_user_id").references(() => user.id, { onDelete: "set null" }),
    reviewNote: text("review_note"),
    name: text("name"),
    description: text("description"),
    source: text("source"),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    ownerDateIndex: index("transactions_owner_date_idx").on(table.ownerUserId, table.eventDate),
    ownerAccountIndex: index("transactions_owner_account_idx").on(table.ownerUserId, table.brokerAccountId),
    ownerAccountFingerprintUnique: uniqueIndex("transactions_owner_account_fingerprint_unique").on(
      table.ownerUserId,
      table.brokerAccountId,
      table.eventFingerprint,
    ),
  }),
);

export const positions = pgTable(
  "positions",
  {
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    brokerAccountId: uuid("broker_account_id")
      .notNull()
      .references(() => brokerAccounts.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    isin: text("isin"),
    currency: text("currency").notNull(),
    quantity: numeric("quantity").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.ownerUserId, table.brokerAccountId, table.symbol, table.currency] }),
  }),
);

export const fxRates = pgTable(
  "fx_rates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: text("date").notNull(),
    fromCurrency: text("from_currency").notNull(),
    toCurrency: text("to_currency").notNull().default("EUR"),
    rate: numeric("rate").notNull(),
  },
  (table) => ({
    fxUnique: uniqueIndex("fx_rates_pair_date_unique").on(table.date, table.fromCurrency, table.toCurrency),
  }),
);

export const taxReports = pgTable(
  "tax_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    taxYear: integer("tax_year").notNull(),
    status: text("status").notNull().default("DRAFT"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    ownerYearUnique: uniqueIndex("tax_reports_owner_year_unique").on(table.ownerUserId, table.taxYear),
  }),
);

export const taxReportLines = pgTable(
  "tax_report_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    taxReportId: uuid("tax_report_id")
      .notNull()
      .references(() => taxReports.id, { onDelete: "cascade" }),
    lineKey: text("line_key").notNull(),
    amount: numeric("amount").notNull(),
    currency: text("currency").notNull().default("EUR"),
    evidence: jsonb("evidence").notNull().default([]),
  },
  (table) => ({
    reportLineUnique: uniqueIndex("tax_report_lines_report_line_unique").on(table.taxReportId, table.lineKey),
  }),
);

export const lots = pgTable(
  "lots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    brokerAccountId: uuid("broker_account_id").notNull().references(() => brokerAccounts.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    isin: text("isin"),
    openedAt: text("opened_at").notNull(),
    remainingQty: numeric("remaining_qty").notNull(),
    costEur: numeric("cost_eur").notNull(),
    sourceEventFingerprint: text("source_event_fingerprint").notNull(),
  },
  (table) => ({
    ownerAcctSymbolIdx: index("lots_owner_acct_symbol_idx").on(table.ownerUserId, table.brokerAccountId, table.symbol),
  }),
);

export const realizedMatches = pgTable(
  "realized_matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    brokerAccountId: uuid("broker_account_id").notNull().references(() => brokerAccounts.id, { onDelete: "cascade" }),
    symbol: text("symbol").notNull(),
    isin: text("isin"),
    openingFingerprint: text("opening_fingerprint").notNull(),
    closingFingerprint: text("closing_fingerprint").notNull(),
    qty: numeric("qty").notNull(),
    costEur: numeric("cost_eur").notNull(),
    proceedsEur: numeric("proceeds_eur").notNull(),
    gainEur: numeric("gain_eur").notNull(),
    holdingDays: integer("holding_days").notNull(),
    isLongTerm: boolean("is_long_term").notNull(),
    closedAt: text("closed_at").notNull(),
  },
  (table) => ({
    ownerClosedIdx: index("realized_matches_owner_closed_idx").on(table.ownerUserId, table.closedAt),
  }),
);

export const quoteCache = pgTable(
  "quote_cache",
  {
    symbol: text("symbol").notNull(),
    date: text("date").notNull(),
    currency: text("currency").notNull(),
    close: numeric("close").notNull(),
    source: text("source").notNull().default("YAHOO"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.symbol, table.date] }),
  }),
);

export const userSettings = pgTable("user_settings", {
  ownerUserId: text("owner_user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  filingStatus: text("filing_status").notNull().default("SINGLE"),
  jurisdiction: text("jurisdiction").notNull().default("DE"),
  saverAllowance: numeric("saver_allowance").notNull().default("1000"),
  lotMethod: text("lot_method").notNull().default("FIFO"),
  fxSource: text("fx_source").notNull().default("ECB"),
  accentPalette: jsonb("accent_palette").notNull().default(["#7CFFB2","#FFD24A","#FF5DA2"]),
  hideValues: boolean("hide_values").notNull().default(false),
  benchmarkSymbol: text("benchmark_symbol").notNull().default("^GSPC"),
  notifyDailySummary: boolean("notify_daily_summary").notNull().default(false),
  autoRedactTickers: boolean("auto_redact_tickers").notNull().default(false),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const quoteHistory = pgTable(
  "quote_history",
  {
    symbol: text("symbol").notNull(),
    date: text("date").notNull(),
    close: numeric("close").notNull(),
    currency: text("currency").notNull(),
    source: text("source").notNull().default("YAHOO"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.symbol, table.date] }),
    symbolDateIdx: index("quote_history_symbol_date_idx").on(table.symbol, table.date),
  }),
);
