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
}).passthrough();

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
  events: z.array(eventSchema),
});

export type IngestPayload = z.infer<typeof ingestPayloadSchema>;
