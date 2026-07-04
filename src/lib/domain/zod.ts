import { z } from "zod";

export const eventSchema = z.object({
  id: z.string(),
  broker: z.enum(["INTERACTIVE_BROKERS", "FREEDOM_FINANCE"]),
  accountNumber: z.string(),
  type: z.enum(["TRADE","DIVIDEND","INTEREST","FEE","WITHHOLDING_TAX","FX_CONVERSION","CASH_TRANSFER","CORPORATE_ACTION","POSITION_SNAPSHOT"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  currency: z.string(),
  symbol: z.string().optional(),
  isin: z.string().optional(),
  description: z.string().optional(),
  quantity: z.string().optional(),
  price: z.string().optional(),
  amount: z.string().optional(),
  cashAmount: z.string().optional(),
  proceeds: z.string().optional(),
  fee: z.string().optional(),
  realizedPnl: z.string().optional(),
  withholdingTax: z.string().optional(),
  source: z.string().optional(),
  // Broker-parser-supplied extras (previously carried by .passthrough()).
  // Enumerated explicitly so unknown/attacker-injected keys are stripped by
  // zod's default rather than persisted verbatim into transactions.raw.
  name: z.string().optional(),                 // instrument display name (ingest.ts)
  instrumentKind: z.string().optional(),       // FF instr_kind / IBKR FII → instruments.kind
  brokerEurAmount: z.union([z.string(), z.number()]).optional(), // broker's own EUR figure (tax fx-delta, v2)
});

export const snapshotQuoteSchema = z.object({
  symbol: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  close: z.string(),
  currency: z.string(),
  source: z.string(),
});

export const ingestPayloadSchema = z.object({
  broker: z.enum(["INTERACTIVE_BROKERS", "FREEDOM_FINANCE"]),
  fileName: z.string(),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/),
  taxYear: z.number().int().min(2000).max(2100),
  account: z.object({
    accountNumber: z.string(),
    baseCurrency: z.string().optional(),
    statementStartDate: z.string().optional(),
    statementEndDate: z.string().optional(),
  }),
  // Bounded to cap memory/DB blowup from a malformed or hostile payload.
  // 100k comfortably covers a multi-year, multi-account real statement.
  events: z.array(eventSchema).max(100_000),
  /** Optional broker-end-of-statement quotes for held positions. Used to
   *  seed quote_cache for symbols our free providers can't price (UCITS
   *  ETFs on Amsterdam/Frankfurt, Freedom-specific aliases like RY4C). */
  snapshotQuotes: z.array(snapshotQuoteSchema).max(50_000).optional(),
});

export type IngestPayload = z.infer<typeof ingestPayloadSchema>;
