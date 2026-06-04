import type { Broker, EventType, NormalizedEvent } from "@/lib/domain/types";

export type { NormalizedEvent };

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

export type ParsedBrokerStatement = {
  account: BrokerAccountMetadata;
  events: NormalizedEvent[];
};

export type ParseBrokerStatementInput = {
  broker?: BrokerId;
  fileName: string;
  bytes: Uint8Array | ArrayBuffer;
  taxYear: number;
};
