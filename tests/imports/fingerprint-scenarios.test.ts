import { describe, it, expect } from "vitest";
import { computeEventFingerprint } from "@/lib/imports/fingerprint";
import type { NormalizedEvent } from "@/lib/domain/types";

const BASE: NormalizedEvent = {
  id: "test-id-001",
  broker: "INTERACTIVE_BROKERS",
  accountNumber: "U999999",
  type: "TRADE",
  date: "2024-03-15",
  currency: "USD",
  source: "Trades",
  symbol: "AAPL",
  isin: "US0378331005",
  quantity: "10",
  price: "175.00",
  amount: "1750.00",
  fee: "1.00",
};

describe("computeEventFingerprint — collision resistance", () => {
  it("same event produces same hash", () => {
    expect(computeEventFingerprint(BASE)).toBe(computeEventFingerprint({ ...BASE }));
  });

  it("two events differing only in date produce different hashes", () => {
    const a = { ...BASE, date: "2024-03-15" };
    const b = { ...BASE, date: "2024-03-16" };
    expect(computeEventFingerprint(a)).not.toBe(computeEventFingerprint(b));
  });

  it("two events differing only in symbol produce different hashes", () => {
    const a = { ...BASE, symbol: "AAPL" };
    const b = { ...BASE, symbol: "MSFT" };
    expect(computeEventFingerprint(a)).not.toBe(computeEventFingerprint(b));
  });

  it("two events differing only in quantity produce different hashes", () => {
    const a = { ...BASE, quantity: "10" };
    const b = { ...BASE, quantity: "11" };
    expect(computeEventFingerprint(a)).not.toBe(computeEventFingerprint(b));
  });

  it("two events differing only in amount produce different hashes", () => {
    const a = { ...BASE, amount: "1750.00" };
    const b = { ...BASE, amount: "1751.00" };
    expect(computeEventFingerprint(a)).not.toBe(computeEventFingerprint(b));
  });

  it("undefined optional fields are treated as empty string (don't affect hash relative to a missing-key event)", () => {
    // description is undefined vs absent — both should hash the same
    const withUndefined: NormalizedEvent = { ...BASE, description: undefined };
    const withoutKey: NormalizedEvent = { ...BASE };
    delete (withoutKey as Partial<NormalizedEvent>).description;
    expect(computeEventFingerprint(withUndefined)).toBe(computeEventFingerprint(withoutKey));
  });

  it("whitespace in description is trimmed before hashing", () => {
    const a: NormalizedEvent = { ...BASE, description: "  buy order  " };
    const b: NormalizedEvent = { ...BASE, description: "buy order" };
    expect(computeEventFingerprint(a)).toBe(computeEventFingerprint(b));
  });

  it("id, fxSource, requiresReview, reviewedAt, importedAt do NOT affect the fingerprint (but source DOES)", () => {
    const base = { ...BASE };
    // Changing non-identity fields should NOT change the hash
    const withExtras: NormalizedEvent = {
      ...base,
      id: "completely-different-id",
      fxSource: "ECB",
      requiresReview: true,
      reviewedAt: "2025-01-01T00:00:00Z",
      importedAt: "2025-01-02T00:00:00Z",
    };
    expect(computeEventFingerprint(base)).toBe(computeEventFingerprint(withExtras));

    // But changing source (which IS an identity field) MUST change the hash
    const withDifferentSource: NormalizedEvent = { ...base, source: "DifferentSource" };
    expect(computeEventFingerprint(base)).not.toBe(computeEventFingerprint(withDifferentSource));
  });
});
