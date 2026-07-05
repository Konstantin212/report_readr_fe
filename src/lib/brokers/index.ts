import { parseFreedomFinanceStatement } from "./freedom";
import { parseInteractiveBrokersStatement } from "./ibkr";
import { detectBroker } from "./detect";
import type { ParseBrokerStatementInput, ParsedBrokerStatement } from "./types";
import type { ParsedImport } from "@/lib/domain/types";

export function parseBrokerStatement(input: ParseBrokerStatementInput): ParsedImport {
  const parsed = parseBroker(input);

  return {
    broker: parsed.account.broker,
    fileName: parsed.account.fileName,
    taxYear: parsed.account.taxYear,
    account: {
      broker: parsed.account.broker,
      accountNumber: parsed.account.accountNumber,
      baseCurrency: parsed.account.baseCurrency,
      displayName: parsed.account.brokerName,
    },
    events: parsed.events.map((event) => ({
      ...event,
      currency: event.currency ?? parsed.account.baseCurrency ?? "UNKNOWN",
    })),
    importedAt: new Date().toISOString(),
    statementStartDate: parsed.account.statementStartDate,
    statementEndDate: parsed.account.statementEndDate,
    snapshotQuotes: parsed.snapshotQuotes,
  };
}

function parseBroker(input: ParseBrokerStatementInput): ParsedBrokerStatement {
  const bytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);
  const broker = input.broker ?? detectBroker({ fileName: input.fileName, bytes });
  if (!broker) throw new Error("UNKNOWN_BROKER");

  if (broker === "INTERACTIVE_BROKERS") {
    return parseInteractiveBrokersStatement(input.fileName, input.bytes, input.taxYear);
  }

  return parseFreedomFinanceStatement(input.fileName, input.bytes, input.taxYear);
}

export type { ParseBrokerStatementInput } from "./types";
