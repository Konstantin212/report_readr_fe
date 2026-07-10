/**
 * Pure resolver for the instruments ISIN→symbol bridge.
 *
 * The bridge drives the position's display ticker AND its symbol-keyed quote
 * lookup. After a rename (SKHYV → SKHY, same ISIN) the surviving, tradeable
 * ticker is SKHY; keying off the first-seen event would freeze the position on
 * the delisted SKHYV and its quotes would go dead. The resolver picks the
 * current ticker per ISIN: a SYMBOL_CHANGE destination wins, else the
 * newest-dated event's symbol — independent of event order in the payload.
 */
import { describe, it, expect } from "vitest";
import { resolveInstrumentSymbols } from "@/lib/imports/instrument-symbols";

type E = Parameters<typeof resolveInstrumentSymbols>[0][number];
const ISIN = "US78392J1007";

const ev = (date: string, symbol: string, isin?: string, extra: Partial<E> = {}): E => ({
  date, symbol, isin, type: "TRADE", ...extra,
});
const renameEv = (date: string): E => ({
  date, symbol: "SKHY", isin: ISIN, type: "CORPORATE_ACTION",
  description: `SKHYV(${ISIN}) Symbol Change to SKHY(${ISIN})`,
});

describe("resolveInstrumentSymbols", () => {
  it("picks the newest-dated symbol per ISIN", () => {
    const map = resolveInstrumentSymbols([
      ev("2025-07-10", "SKHYV", ISIN),
      ev("2025-07-14", "SKHY", ISIN),
    ]);
    expect(map.get(ISIN)).toBe("SKHY");
  });

  it("is independent of payload order", () => {
    const map = resolveInstrumentSymbols([
      ev("2025-07-14", "SKHY", ISIN),
      ev("2025-07-10", "SKHYV", ISIN),
    ]);
    expect(map.get(ISIN)).toBe("SKHY");
  });

  it("lets a SYMBOL_CHANGE destination win even over a later stray old-ticker row", () => {
    const map = resolveInstrumentSymbols([
      ev("2025-07-10", "SKHYV", ISIN),
      renameEv("2025-07-13"),
      ev("2025-07-20", "SKHYV", ISIN), // a straggler still labelled with the old ticker
    ]);
    expect(map.get(ISIN)).toBe("SKHY");
  });

  it("ignores events without an ISIN", () => {
    const map = resolveInstrumentSymbols([ev("2025-07-10", "SKHYV")]);
    expect(map.size).toBe(0);
  });
});
