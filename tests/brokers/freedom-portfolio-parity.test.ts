/**
 * Real-portfolio parity test.
 *
 * Locks the entire FF parse → FIFO replay → open-positions chain
 * against a verbatim user statement (2026-06-06). The expected
 * numbers come from the Freedom24 web UI's "Opened positions" view
 * on the same date, so a failure here means our pipeline has drifted
 * from what the broker shows — exactly the symptom that triggered
 * this fixture's creation (zombie positions for MQ / NEE / MS / NVDA
 * / NFLX, doubled qty on some others).
 *
 * Fixture: tests/fixtures/brokers/freedom-portfolio-2026-06-06.json
 *   - real JSON export
 *   - client_code and client_name redacted to FF-TEST / Test User
 *   - everything else verbatim (172 trades, 722 cash flows, 335
 *     corporate actions, 9 open positions in the snapshot)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseFreedomFinanceStatement } from "@/lib/brokers/freedom";
import { replay } from "@/lib/ledger/replay";
import type { NormalizedEvent } from "@/lib/domain/types";

const bytes = readFileSync("tests/fixtures/brokers/freedom-portfolio-2026-06-06.json");

type Expected = { ticker: string; qty: number; entryPrice: number; bookValueNative: number; currency: "EUR" | "USD" };

/**
 * Ground truth taken from the FF web UI "Opened positions" tab on
 * 2026-06-06 (the same date the JSON snapshot was generated). The
 * tickers are the form WE use after parser normalisation (suffix
 * stripped). For Ryanair, FF's snapshot calls it RYA but trades call
 * it RY4C — our ISIN-based remap reroutes RYA→RY4C so the canonical
 * ticker in our pipeline is RY4C.
 */
const EXPECTED_POSITIONS: Expected[] = [
  { ticker: "RY4C", qty: 8,  entryPrice: 16.620,  bookValueNative: 132.96,   currency: "EUR" },
  { ticker: "C",    qty: 24, entryPrice: 47.49,   bookValueNative: 1139.69,  currency: "USD" },
  { ticker: "DIS",  qty: 20, entryPrice: 108.96,  bookValueNative: 2179.21,  currency: "USD" },
  { ticker: "HOOD", qty: 21, entryPrice: 40.44,   bookValueNative: 849.18,   currency: "USD" },
  { ticker: "NEM",  qty: 10, entryPrice: 61.50,   bookValueNative: 615.03,   currency: "USD" },
  { ticker: "NET",  qty: 3,  entryPrice: 192.17,  bookValueNative: 576.50,   currency: "USD" },
  { ticker: "O",    qty: 35, entryPrice: 60.17,   bookValueNative: 2105.89,  currency: "USD" },
  { ticker: "SPY",  qty: 24, entryPrice: 393.74,  bookValueNative: 9449.71,  currency: "USD" },
  { ticker: "TTWO", qty: 4,  entryPrice: 119.14,  bookValueNative: 476.54,   currency: "USD" },
];

function runPipeline() {
  const parsed = parseFreedomFinanceStatement(
    "freedom-portfolio-2026-06-06.json",
    bytes,
    2026,
  );
  const events: NormalizedEvent[] = parsed.events.map((e) => ({
    ...e,
    currency: e.currency ?? "UNKNOWN",
  }));
  const { lots, matches } = replay(events);
  const openBySymbol = new Map<string, number>();
  for (const lot of lots) {
    const qty = Number(lot.remainingQty);
    if (qty <= 0) continue;
    if (!lot.symbol) continue;
    openBySymbol.set(lot.symbol, (openBySymbol.get(lot.symbol) ?? 0) + qty);
  }
  return { parsed, events, lots, matches, openBySymbol };
}

describe("Freedom Finance real-portfolio parity (2026-06-06)", () => {
  it("yields exactly 9 open positions — no zombies", () => {
    const { openBySymbol } = runPipeline();
    const openTickers = Array.from(openBySymbol.keys()).sort();
    const expected = EXPECTED_POSITIONS.map((p) => p.ticker).sort();
    expect(openTickers).toEqual(expected);
  });

  for (const exp of EXPECTED_POSITIONS) {
    it(`${exp.ticker}: holds ${exp.qty} shares`, () => {
      const { openBySymbol } = runPipeline();
      const actual = openBySymbol.get(exp.ticker);
      expect(actual).toBeDefined();
      expect(actual).toBeCloseTo(exp.qty, 4);
    });
  }

  it("snapshot quotes are captured for every held position", () => {
    const { parsed } = runPipeline();
    const symbols = (parsed.snapshotQuotes ?? []).map((q) => q.symbol).sort();
    const expected = EXPECTED_POSITIONS.map((p) => p.ticker).sort();
    expect(symbols).toEqual(expected);
  });

  it("every snapshot quote carries source FREEDOM_SNAPSHOT", () => {
    const { parsed } = runPipeline();
    expect((parsed.snapshotQuotes ?? []).every((q) => q.source === "FREEDOM_SNAPSHOT")).toBe(true);
  });
});
