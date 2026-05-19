import { describe, it, expect } from "vitest";
import { replay } from "@/lib/ledger/replay";
import type { NormalizedEvent } from "@/lib/domain/types";

const t = (
  id: string,
  date: string,
  symbol: string,
  qty: string,
  amount: string,
  isin?: string,
): NormalizedEvent => ({
  id,
  broker: "INTERACTIVE_BROKERS",
  accountNumber: "U1",
  type: "TRADE",
  date,
  currency: "EUR",
  symbol,
  isin,
  quantity: qty,
  amount,
  amountEur: amount,
});

describe("FIFO replay — ISIN-based identity", () => {
  it("matches a buy under ticker A with a later sell under renamed ticker B when ISIN is the same", () => {
    const events = [
      t("b1", "2024-01-10", "EUDI", "10", "2466", "IE00B5M1WJ87"),
      t("s1", "2025-04-04", "SPYW", "-10", "2800", "IE00B5M1WJ87"),
    ];
    const { lots, matches } = replay(events);
    expect(lots).toHaveLength(0);
    expect(matches).toHaveLength(1);
    expect(matches[0].symbol).toBe("EUDI"); // opening lot's symbol preserved
    expect(matches[0].isin).toBe("IE00B5M1WJ87");
    expect(Number(matches[0].qty)).toBe(10);
  });

  it("does NOT merge two different symbols when ISINs differ", () => {
    const events = [
      t("b1", "2024-01-10", "AAA", "10", "1000", "ISIN_A"),
      t("s1", "2025-04-04", "BBB", "-10", "1100", "ISIN_B"),
    ];
    const { lots, matches } = replay(events);
    expect(lots).toHaveLength(1); // AAA stays open
    expect(matches).toHaveLength(0); // BBB sell drops (no lot)
  });

  it("falls back to symbol-based identity when neither event has ISIN", () => {
    const events = [
      t("b1", "2024-01-10", "ASML", "10", "7000"),
      t("s1", "2025-04-04", "ASML", "-10", "8000"),
    ];
    const { lots, matches } = replay(events);
    expect(lots).toHaveLength(0);
    expect(matches).toHaveLength(1);
  });
});
