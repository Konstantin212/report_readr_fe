import { describe, expect, it } from "vitest";

import type { NormalizedEvent } from "@/lib/domain/types";
import { replayCrypto } from "@/lib/ledger/crypto-replay";

function ev(type: NormalizedEvent["type"], partial: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    id: partial.id ?? `${type}-${Math.random()}`,
    broker: "COINBASE",
    accountNumber: "ca-1",
    type,
    date: partial.date ?? "2025-01-01",
    currency: "EUR",
    symbol: partial.symbol ?? "BTC",
    ...partial,
  };
}

describe("ledger/crypto-replay", () => {
  it("opens a lot on CRYPTO_BUY at the EUR cost", () => {
    const { lots, matches } = replayCrypto([
      ev("CRYPTO_BUY", { symbol: "BTC", date: "2025-01-15", quantity: "0.05", amountEur: "1500" }),
    ]);
    expect(lots).toHaveLength(1);
    expect(matches).toHaveLength(0);
    expect(lots[0]).toMatchObject({ symbol: "BTC", openedAt: "2025-01-15", remainingQty: "0.05", costEur: "1500" });
  });

  it("opens a lot on CRYPTO_STAKE_REWARD at the EUR fair value at receipt", () => {
    const { lots } = replayCrypto([
      ev("CRYPTO_STAKE_REWARD", { symbol: "ETH", date: "2025-03-10", quantity: "0.001", amountEur: "3" }),
    ]);
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({ symbol: "ETH", openedAt: "2025-03-10", remainingQty: "0.001", costEur: "3" });
  });

  it("FIFO matches a CRYPTO_SELL against the oldest lot first", () => {
    const { lots, matches } = replayCrypto([
      ev("CRYPTO_BUY", { id: "buy-1", symbol: "BTC", date: "2025-01-01", quantity: "0.10", amountEur: "3000" }),
      ev("CRYPTO_BUY", { id: "buy-2", symbol: "BTC", date: "2025-03-01", quantity: "0.10", amountEur: "5000" }),
      ev("CRYPTO_SELL", { id: "sell-1", symbol: "BTC", date: "2025-06-01", quantity: "0.05", amountEur: "3500" }),
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      openingEventId: "buy-1",
      closingEventId: "sell-1",
      qty: "0.05",
      costEur: "1500.00",      // half of the 3000 from buy-1
      proceedsEur: "3500.00",
      gainEur: "2000.00",
      isLongTerm: false,
    });
    // buy-1 has 0.05 remaining, buy-2 still has its full 0.10 (Decimal
    // toString drops trailing zeros, so "0.1" not "0.10")
    expect(lots.find((l) => l.sourceEventId === "buy-1")?.remainingQty).toBe("0.05");
    expect(lots.find((l) => l.sourceEventId === "buy-2")?.remainingQty).toBe("0.1");
  });

  it("flags isLongTerm = true when holding > 365 days (German §23 tax-free rule)", () => {
    const { matches } = replayCrypto([
      ev("CRYPTO_BUY", { id: "old-buy", symbol: "SOL", date: "2024-01-01", quantity: "10", amountEur: "1000" }),
      ev("CRYPTO_SELL", { id: "sell", symbol: "SOL", date: "2025-01-02", quantity: "10", amountEur: "2000" }),
    ]);
    expect(matches[0].holdingDays).toBe(367);
    expect(matches[0].isLongTerm).toBe(true);
    expect(matches[0].gainEur).toBe("1000.00");
  });

  it("flags isLongTerm = false for sales within 365 days", () => {
    const { matches } = replayCrypto([
      ev("CRYPTO_BUY", { id: "recent-buy", symbol: "SOL", date: "2025-01-01", quantity: "10", amountEur: "1000" }),
      ev("CRYPTO_SELL", { id: "sell", symbol: "SOL", date: "2025-09-01", quantity: "10", amountEur: "1500" }),
    ]);
    expect(matches[0].holdingDays).toBeLessThanOrEqual(365);
    expect(matches[0].isLongTerm).toBe(false);
  });

  it("treats sold staking rewards with a clock starting at receipt date", () => {
    // Staking received early 2024, sold late 2025 → over a year, so tax-free.
    const { matches } = replayCrypto([
      ev("CRYPTO_STAKE_REWARD", { id: "stake-1", symbol: "ATOM", date: "2024-06-01", quantity: "10", amountEur: "100" }),
      ev("CRYPTO_SELL", { id: "sell-1", symbol: "ATOM", date: "2025-12-01", quantity: "10", amountEur: "150" }),
    ]);
    expect(matches[0]).toMatchObject({
      openingEventId: "stake-1",
      qty: "10",
      gainEur: "50.00",
      isLongTerm: true,
    });
  });

  it("spans multiple lots when sell quantity exceeds a single lot", () => {
    const { lots, matches } = replayCrypto([
      ev("CRYPTO_BUY", { id: "b1", symbol: "ETH", date: "2025-01-01", quantity: "1", amountEur: "2000" }),
      ev("CRYPTO_BUY", { id: "b2", symbol: "ETH", date: "2025-04-01", quantity: "1", amountEur: "3000" }),
      ev("CRYPTO_SELL", { id: "s1", symbol: "ETH", date: "2025-08-01", quantity: "1.5", amountEur: "4500" }),
    ]);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({ openingEventId: "b1", qty: "1", costEur: "2000.00" });
    expect(matches[1]).toMatchObject({ openingEventId: "b2", qty: "0.5", costEur: "1500.00" });
    // b1 fully consumed, b2 has 0.5 remaining
    expect(lots.find((l) => l.sourceEventId === "b1")).toBeUndefined();
    expect(lots.find((l) => l.sourceEventId === "b2")?.remainingQty).toBe("0.5");
  });

  it("isolates lots by symbol — a BTC sell doesn't consume ETH lots", () => {
    const { matches } = replayCrypto([
      ev("CRYPTO_BUY", { symbol: "ETH", date: "2025-01-01", quantity: "1", amountEur: "2000" }),
      ev("CRYPTO_SELL", { symbol: "BTC", date: "2025-06-01", quantity: "0.5", amountEur: "20000" }),
    ]);
    // Sell with no matching lots → no match emitted (silent skip). For
    // sales without an opening lot the user would have to enter them
    // manually; we don't fabricate a zero-cost match.
    expect(matches).toHaveLength(0);
  });
});
