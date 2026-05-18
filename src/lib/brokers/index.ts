import { parseFreedomFinanceStatement } from "./freedom";
import { parseInteractiveBrokersStatement } from "./ibkr";
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
  };
}

function parseBroker(input: ParseBrokerStatementInput): ParsedBrokerStatement {
  if (input.broker === "INTERACTIVE_BROKERS") {
    return parseInteractiveBrokersStatement(input.fileName, input.bytes, input.taxYear);
  }

  return parseFreedomFinanceStatement(input.fileName, input.bytes, input.taxYear);
}

export type { ParseBrokerStatementInput } from "./types";
