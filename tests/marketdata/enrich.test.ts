import { describe, it, expect } from "vitest";
import { selectCandidates } from "@/lib/marketdata/enrich";
import type { InstrumentMetaGate, InstrumentRef } from "@/lib/marketdata/types";

const NOW = new Date("2026-07-04T00:00:00Z");
const ref = (isin: string, symbol = "X"): InstrumentRef => ({ isin, symbol, currency: null });

function gate(partial: Partial<InstrumentMetaGate> & { isin: string }): InstrumentMetaGate {
  return {
    isin: partial.isin,
    status: partial.status ?? "OK",
    failCount: partial.failCount ?? 0,
    scrapedAt: partial.scrapedAt ?? null,
    updatedAt: partial.updatedAt ?? NOW.toISOString(),
  };
}

describe("selectCandidates", () => {
  it("accepts a fresh valid ISIN with no existing row", () => {
    expect(selectCandidates([ref("IE00B0M63177")], [], NOW)).toHaveLength(1);
  });

  it("rejects a malformed ISIN shape", () => {
    expect(selectCandidates([ref("NOTANISIN")], [], NOW)).toHaveLength(0);
  });

  it("exempts synthetic SYM: keys from the ISIN-shape check", () => {
    expect(selectCandidates([ref("SYM:TRN.L")], [], NOW)).toHaveLength(1);
  });

  it("skips OK/NOT_FOUND rows younger than 30 days", () => {
    const recent = new Date(NOW.getTime() - 5 * 86_400_000).toISOString();
    const existing = [gate({ isin: "IE00B0M63177", status: "OK", scrapedAt: recent })];
    expect(selectCandidates([ref("IE00B0M63177")], existing, NOW)).toHaveLength(0);
  });

  it("re-scrapes OK rows older than 30 days", () => {
    const old = new Date(NOW.getTime() - 40 * 86_400_000).toISOString();
    const existing = [gate({ isin: "IE00B0M63177", status: "OK", scrapedAt: old })];
    expect(selectCandidates([ref("IE00B0M63177")], existing, NOW)).toHaveLength(1);
  });

  it("skips ERROR rows at the failCount cap", () => {
    const existing = [gate({ isin: "IE00B0M63177", status: "ERROR", failCount: 5, updatedAt: new Date(0).toISOString() })];
    expect(selectCandidates([ref("IE00B0M63177")], existing, NOW)).toHaveLength(0);
  });

  it("retries ERROR rows after the exponential backoff window", () => {
    // failCount 2 → backoff 4 days; last attempt 5 days ago → due.
    const fiveDaysAgo = new Date(NOW.getTime() - 5 * 86_400_000).toISOString();
    const existing = [gate({ isin: "IE00B0M63177", status: "ERROR", failCount: 2, updatedAt: fiveDaysAgo })];
    expect(selectCandidates([ref("IE00B0M63177")], existing, NOW)).toHaveLength(1);
  });

  it("holds ERROR rows still inside the backoff window", () => {
    // failCount 2 → backoff 4 days; last attempt 1 day ago → not due.
    const oneDayAgo = new Date(NOW.getTime() - 1 * 86_400_000).toISOString();
    const existing = [gate({ isin: "IE00B0M63177", status: "ERROR", failCount: 2, updatedAt: oneDayAgo })];
    expect(selectCandidates([ref("IE00B0M63177")], existing, NOW)).toHaveLength(0);
  });

  it("dedupes by ISIN and caps at the limit", () => {
    const refs = [ref("IE00B0M63177"), ref("IE00B0M63177"), ref("GB00BKDTK925"), ref("US0378331005")];
    expect(selectCandidates(refs, [], NOW, 2)).toHaveLength(2);
    // dedupe: the two identical IE ISINs count once
    const deduped = selectCandidates([ref("IE00B0M63177"), ref("IE00B0M63177")], [], NOW);
    expect(deduped).toHaveLength(1);
  });
});
