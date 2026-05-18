import type { Broker, EventType, ParsedImport } from "@/lib/domain/types";

export type ImportSummary = {
  broker: Broker;
  accountNumber: string;
  baseCurrency?: string;
  fileName: string;
  fileHash: string;
  taxYear: number;
  eventCount: number;
  insertedEventCount?: number;
  duplicateEventCount?: number;
  statementStartDate?: string;
  statementEndDate?: string;
  reviewRequiredCount?: number;
  eventTypes: Partial<Record<EventType, number>>;
  persisted?: boolean;
  duplicate?: boolean;
};

export function detectBrokerFromFileName(fileName: string): Broker {
  const normalized = fileName.toLowerCase();

  if (normalized.endsWith(".csv") || /^u\d+/.test(normalized)) {
    return "INTERACTIVE_BROKERS";
  }

  if (normalized.endsWith(".json")) {
    return "FREEDOM_FINANCE";
  }

  throw new Error("Unsupported statement format. Upload an IBKR CSV or Freedom Finance JSON statement.");
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function summarizeParsedImport(parsed: ParsedImport, fileHash: string): ImportSummary {
  const eventTypes = parsed.events.reduce<Partial<Record<EventType, number>>>((totals, event) => {
    totals[event.type] = (totals[event.type] ?? 0) + 1;
    return totals;
  }, {});

  return {
    broker: parsed.broker,
    accountNumber: parsed.account.accountNumber,
    baseCurrency: parsed.account.baseCurrency,
    fileName: parsed.fileName,
    fileHash,
    taxYear: parsed.taxYear,
    eventCount: parsed.events.length,
    reviewRequiredCount: parsed.events.filter((event) => event.requiresReview).length,
    eventTypes,
    ...(parsed.statementStartDate ? { statementStartDate: parsed.statementStartDate } : {}),
    ...(parsed.statementEndDate ? { statementEndDate: parsed.statementEndDate } : {}),
  };
}
