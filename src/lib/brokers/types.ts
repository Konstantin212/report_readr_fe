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

/**
 * A spot-quote snapshot for a single symbol, captured from the
 * statement itself (e.g. Freedom24's `account_at_end.positions_from_ts`).
 *
 * Lets the import pipeline seed `quote_cache` with the broker's own
 * end-of-day prices for symbols our free quote providers can't reach
 * (e.g. European UCITS ETFs that Twelve Data free won't price and
 * Yahoo blocks from Vercel IPs). Live API quotes always carry a later
 * date than the statement, so the orchestrator's "latest by date"
 * pick automatically prefers them when present.
 */
export type SnapshotQuote = {
  symbol: string;
  date: string;     // ISO YYYY-MM-DD (statement end)
  close: string;
  currency: string;
};

export type ParsedBrokerStatement = {
  account: BrokerAccountMetadata;
  events: NormalizedEvent[];
  /** Optional broker-provided spot prices for currently-held positions. */
  snapshotQuotes?: SnapshotQuote[];
};

export type ParseBrokerStatementInput = {
  broker?: BrokerId;
  fileName: string;
  bytes: Uint8Array | ArrayBuffer;
  taxYear: number;
};
