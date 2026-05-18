import { describe, expect, it } from "vitest";

import { mergeImportSummaries, type StoredImportSummary } from "@/lib/imports/local-import-store";

const baseSummary: StoredImportSummary = {
  broker: "INTERACTIVE_BROKERS",
  accountNumber: "U13142092",
  baseCurrency: "EUR",
  fileName: "U13142092_2024_2024.csv",
  fileHash: "hash-1",
  taxYear: 2024,
  eventCount: 28,
  eventTypes: { TRADE: 14, INTEREST: 10, FEE: 3, CASH_TRANSFER: 1 },
  persisted: false,
  duplicate: false,
  importedAt: "2026-05-16T10:00:00.000Z",
};

describe("local import store", () => {
  it("prepends the latest import summary", () => {
    const next = mergeImportSummaries(
      [{ ...baseSummary, fileHash: "old", importedAt: "2026-05-15T10:00:00.000Z" }],
      baseSummary,
    );

    expect(next.map((summary) => summary.fileHash)).toEqual(["hash-1", "old"]);
  });

  it("replaces an existing summary for the same file hash", () => {
    const updated = { ...baseSummary, eventCount: 30, importedAt: "2026-05-16T11:00:00.000Z" };
    const next = mergeImportSummaries([baseSummary], updated);

    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ fileHash: "hash-1", eventCount: 30, importedAt: updated.importedAt });
  });

  it("caps stored summaries to the configured limit", () => {
    const existing = Array.from({ length: 12 }, (_, index) => ({
      ...baseSummary,
      fileHash: `hash-${index + 2}`,
    }));

    const next = mergeImportSummaries(existing, baseSummary, 10);

    expect(next).toHaveLength(10);
    expect(next[0]?.fileHash).toBe("hash-1");
    expect(next.at(-1)?.fileHash).toBe("hash-10");
  });
});
