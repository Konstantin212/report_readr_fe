import type { Broker, EventType } from "@/lib/domain/types";

export const brokerIds = ["INTERACTIVE_BROKERS", "FREEDOM_FINANCE"] as const;

export type BrokerId = Broker;

export const normalizedEventTypes = [
  "TRADE",
  "INTEREST",
  "FEE",
  "CASH_TRANSFER",
  "DIVIDEND",
  "CORPORATE_ACTION",
] as const;

export type NormalizedEventType = EventType;

export type BrokerAccountMetadata = {
  broker: BrokerId;
  brokerName?: string;
  accountNumber: string;
  baseCurrency?: string;
  statementPeriod?: string;
  statementStartDate?: string;
  statementEndDate?: string;
  fileName: string;
  taxYear: number;
};

export type NormalizedEvent = {
  id: string;
  broker: BrokerId;
  accountNumber: string;
  type: NormalizedEventType;
  date: string;
  currency: string;
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
  fee?: string;
  feeEur?: string;
  realizedPnl?: string;
  realizedPnlEur?: string;
  withholdingTax?: string;
  withholdingTaxEur?: string;
  fxSource?: "BROKER" | "MANUAL_REVIEW" | "MISSING";
  requiresReview?: boolean;
  reviewedAt?: string;
  reviewedByUserId?: string;
  reviewNote?: string;
  source?: string;
};

export type ParsedBrokerStatement = {
  account: BrokerAccountMetadata;
  events: NormalizedEvent[];
};

export type ParseBrokerStatementInput = {
  broker: BrokerId;
  fileName: string;
  bytes: Uint8Array | ArrayBuffer;
  taxYear: number;
};
