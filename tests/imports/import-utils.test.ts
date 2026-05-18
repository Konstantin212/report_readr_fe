import { describe, expect, it } from "vitest";

import { detectBrokerFromFileName, summarizeParsedImport } from "@/lib/imports/import-utils";
import type { ParsedImport } from "@/lib/domain/types";

describe("import utilities", () => {
  it("detects supported brokers from common statement file names", () => {
    expect(detectBrokerFromFileName("U13142092_2024_2024.csv")).toBe("INTERACTIVE_BROKERS");
    expect(detectBrokerFromFileName("201743_2024_all.json")).toBe("FREEDOM_FINANCE");
  });

  it("summarizes a parsed import without exposing raw statement bytes", () => {
    const parsed: ParsedImport = {
      broker: "FREEDOM_FINANCE",
      fileName: "statement.json",
      taxYear: 2024,
      account: {
        broker: "FREEDOM_FINANCE",
        accountNumber: "FF000000",
        baseCurrency: "EUR",
      },
      events: [
        {
          id: "trade",
          broker: "FREEDOM_FINANCE",
          accountNumber: "FF000000",
          type: "TRADE",
          date: "2024-01-01",
          currency: "USD",
        },
      ],
    };

    expect(summarizeParsedImport(parsed, "abc123")).toEqual({
      broker: "FREEDOM_FINANCE",
      accountNumber: "FF000000",
      baseCurrency: "EUR",
      fileName: "statement.json",
      fileHash: "abc123",
      taxYear: 2024,
      eventCount: 1,
      reviewRequiredCount: 0,
      eventTypes: { TRADE: 1 },
    });
  });
});
