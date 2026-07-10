/**
 * Ticker rename (SKHYV → SKHY) in the FIFO replay.
 *
 * The dangerous case: the when-issued leg (SKHYV) trades WITHOUT a stable ISIN
 * while the permanent leg (SKHY) carries one. Keyed naively, they split into
 * two positions and FIFO breaks. A SYMBOL_CHANGE corporate-action row supplies
 * the missing link so replay folds SKHYV's lots onto the SKHY/ISIN identity.
 */
import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { replay } from "@/lib/ledger/replay";
import type { NormalizedEvent } from "@/lib/domain/types";

const ISIN = "US78392J1007";

const trade = (
  id: string,
  date: string,
  symbol: string,
  qty: string,
  amountEur: string,
  isin?: string,
): NormalizedEvent => ({
  id,
  broker: "INTERACTIVE_BROKERS",
  accountNumber: "U00000000",
  type: "TRADE",
  date,
  currency: "EUR",
  symbol,
  isin,
  quantity: qty,
  amount: amountEur,
  amountEur,
});

const rename = (id: string, date: string): NormalizedEvent => ({
  id,
  broker: "INTERACTIVE_BROKERS",
  accountNumber: "U00000000",
  type: "CORPORATE_ACTION",
  date,
  currency: "USD",
  symbol: "SKHY",
  isin: ISIN,
  description: `SKHYV(${ISIN}) Symbol Change to SKHY(${ISIN})`,
});

const closedQty = (matches: ReturnType<typeof replay>["matches"]) =>
  matches.reduce((s, m) => s.plus(m.qty), new Decimal(0));
const openQty = (lots: ReturnType<typeof replay>["lots"]) =>
  lots.reduce((s, l) => s.plus(l.remainingQty), new Decimal(0));

describe("replay — ticker rename via SYMBOL_CHANGE", () => {
  // SKHYV: 10 @ €100 (no ISIN). SKHY: 5 @ €60 (ISIN). Sell 12 SKHY.
  const buyOld = trade("b1", "2025-07-10", "SKHYV", "10", "1000"); // no isin
  const buyNew = trade("b2", "2025-07-14", "SKHY", "5", "300", ISIN);
  const sell = trade("s1", "2025-08-01", "SKHY", "-12", "1800", ISIN);

  it("merges the when-issued leg onto the permanent identity (FIFO continuous)", () => {
    const { lots, matches } = replay([buyOld, rename("ca1", "2025-07-13"), buyNew, sell]);
    // All 12 sold shares match against one merged inventory of 15.
    expect(closedQty(matches).toNumber()).toBe(12);
    expect(openQty(lots).toNumber()).toBe(3);
    // The oldest consumed lot is the SKHYV buy → holding period spans the rename.
    const earliest = matches.reduce((a, b) => (a.holdingDays > b.holdingDays ? a : b));
    expect(earliest.holdingDays).toBe(22); // 2025-07-10 → 2025-08-01
  });

  it("without the rename row the two tickers stay split and FIFO under-fills", () => {
    // Control: no SYMBOL_CHANGE → SKHYV (no isin) and SKHY (isin) are separate,
    // so selling 12 SKHY can only close the 5 SKHY shares that exist.
    const { matches } = replay([buyOld, buyNew, sell]);
    expect(closedQty(matches).toNumber()).toBe(5);
  });

  it("merges a CUSIP/ISIN change where the old leg carries a DIFFERENT ISIN", () => {
    // The old ticker traded under its own (when-issued) ISIN; the rename row
    // records old→new ISIN. Both legs must still collapse to one position.
    const OLD_ISIN = "US78392J1006";
    const buyOldIsin = trade("b1", "2025-07-10", "SKHYV", "10", "1000", OLD_ISIN);
    const cusipChange: NormalizedEvent = {
      id: "ca1", broker: "INTERACTIVE_BROKERS", accountNumber: "U00000000",
      type: "CORPORATE_ACTION", date: "2025-07-13", currency: "USD", symbol: "SKHY", isin: ISIN,
      description: `SKHYV(${OLD_ISIN}) CUSIP/ISIN Change to SKHY(${ISIN})`,
    };
    const { matches } = replay([buyOldIsin, cusipChange, buyNew, sell]);
    expect(closedQty(matches).toNumber()).toBe(12);
  });

  it("is a no-op when both legs already carry the same ISIN", () => {
    // ISIN present on both → already one identity; the alias changes nothing.
    const buyOldWithIsin = trade("b1", "2025-07-10", "SKHYV", "10", "1000", ISIN);
    const { matches } = replay([buyOldWithIsin, buyNew, sell]);
    expect(closedQty(matches).toNumber()).toBe(12);
  });
});
