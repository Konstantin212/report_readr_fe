/**
 * Real-portfolio parity test for Interactive Brokers.
 *
 * Locks the IBKR parse → FIFO replay → open-positions chain against
 * a verbatim Activity Statement set (2023, 2024, 2025, YTD-2026-06-05).
 * Ground truth is the broker's own "Open Positions" section in the
 * YTD-2026 CSV (which IBKR computes natively from the same trades) —
 * cost basis is IBKR avg-cost, ours is FIFO, so per-position cost
 * may differ a few % on positions with realized sells. Quantities
 * MUST match exactly; tickers MUST match exactly.
 *
 * Fixtures (gitignored — real account):
 *   tests/fixtures/brokers/ibkr-portfolio-2026-06-06/U00000000_*.csv
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { parseBrokerStatement } from "@/lib/brokers";
import { replay } from "@/lib/ledger/replay";
import type { NormalizedEvent } from "@/lib/domain/types";

const FIXTURE_DIR = "tests/fixtures/brokers/ibkr-portfolio-2026-06-06";
const FILES = [
  "U00000000_2023_2023.csv",
  "U00000000_2024_2024.csv",
  "U00000000_2025_2025.csv",
  "U00000000_20260101_20260605.csv",
];

type Expected = {
  ticker: string;
  qty: number;
  costBasisNative: number; // IBKR avg-cost
  closePriceNative: number;
  unrealizedNative: number;
  currency: "EUR" | "USD" | "GBP";
};

/**
 * Ground truth lifted verbatim from the YTD-2026 CSV's "Open Positions"
 * section (the broker's own reckoning of avg-cost). Note: IBKR stores
 * Trainline as "TRNl" (LSE suffix) but the broker UI strips it to TRN.
 * Whatever canonical form our parser settles on is what the test
 * expects — if the parser keeps "TRNl", change the ticker here.
 */
const EXPECTED_POSITIONS: Expected[] = [
  // EUR
  { ticker: "IEMM", qty: 12.1158, costBasisNative: 620.996092, closePriceNative: 57.226, unrealizedNative: 72.343635, currency: "EUR" },
  { ticker: "SPYW", qty: 133.0089, costBasisNative: 3282.999474, closePriceNative: 28.905, unrealizedNative: 561.620526, currency: "EUR" },
  { ticker: "VHYL", qty: 13.9405, costBasisNative: 902.998680, closePriceNative: 78.04, unrealizedNative: 184.92132, currency: "EUR" },
  { ticker: "VUSA", qty: 25.6791, costBasisNative: 2641.954634, closePriceNative: 121.265, unrealizedNative: 472.025365, currency: "EUR" },
  { ticker: "XSX7", qty: 12.0298, costBasisNative: 1114.97407, closePriceNative: 97.37, unrealizedNative: 56.365932, currency: "EUR" },
  // GBP — IBKR stores raw symbol "TRNl" (LSE listing); parser canonicalises
  // to the underlying "TRN" via the Financial Instrument Information section.
  { ticker: "TRN", qty: 441.0319, costBasisNative: 990.895791, closePriceNative: 2.272, unrealizedNative: 11.124209, currency: "GBP" },
  // USD
  { ticker: "BLBD", qty: 4.143, costBasisNative: 215.996092, closePriceNative: 69.68, unrealizedNative: 72.683908, currency: "USD" },
  { ticker: "COIN", qty: 4.7794, costBasisNative: 828.290361, closePriceNative: 152.4, unrealizedNative: -99.910361, currency: "USD" },
  { ticker: "CRCL", qty: 9.706, costBasisNative: 1000.99334, closePriceNative: 80.28, unrealizedNative: -221.79334, currency: "USD" },
  { ticker: "GOOGL", qty: 3.0841, costBasisNative: 1000.989425, closePriceNative: 368.53, unrealizedNative: 135.590575, currency: "USD" },
  { ticker: "RBRK", qty: 4.7667, costBasisNative: 405.997412, closePriceNative: 73.41, unrealizedNative: -56.077412, currency: "USD" },
  { ticker: "SONY", qty: 37.9744, costBasisNative: 885.998676, closePriceNative: 21.89, unrealizedNative: -54.738677, currency: "USD" },
  { ticker: "TSM", qty: 2.3156, costBasisNative: 349.194968, closePriceNative: 415.17, unrealizedNative: 612.175032, currency: "USD" },
];

function runPipeline() {
  if (!existsSync(`${FIXTURE_DIR}/${FILES[0]}`)) {
    throw new Error(
      `IBKR fixture missing at ${FIXTURE_DIR}. Drop the four U00000000_*.csv ` +
      `files into that directory (gitignored) and re-run.`,
    );
  }
  const events: NormalizedEvent[] = [];
  let accountNumber: string | undefined;
  let latestSnapshotQuotes: ReturnType<typeof parseBrokerStatement>["snapshotQuotes"];
  for (const name of FILES) {
    const bytes = readFileSync(`${FIXTURE_DIR}/${name}`);
    const parsed = parseBrokerStatement({
      broker: "INTERACTIVE_BROKERS",
      fileName: name,
      bytes,
      taxYear: Number(name.slice(9, 13)),
    });
    if (!accountNumber) accountNumber = parsed.account.accountNumber;
    if (parsed.snapshotQuotes && parsed.snapshotQuotes.length > 0) {
      latestSnapshotQuotes = parsed.snapshotQuotes;
    }
    for (const e of parsed.events) {
      events.push({ ...e, currency: e.currency ?? "UNKNOWN" });
    }
  }
  // Stable chronological order across the year boundaries.
  events.sort((a, b) => {
    if (a.date === b.date) return 0;
    return a.date < b.date ? -1 : 1;
  });
  const { lots, matches } = replay(events);
  const openBySymbol = new Map<string, number>();
  for (const lot of lots) {
    const qty = Number(lot.remainingQty);
    if (qty <= 0) continue;
    if (!lot.symbol) continue;
    openBySymbol.set(lot.symbol, (openBySymbol.get(lot.symbol) ?? 0) + qty);
  }
  return { accountNumber, events, lots, matches, openBySymbol, snapshotQuotes: latestSnapshotQuotes ?? [] };
}

describe("Interactive Brokers real-portfolio parity (U00000000, 2026-06-06)", () => {
  it("parses all four annual statements and produces account U00000000", () => {
    const { accountNumber } = runPipeline();
    expect(accountNumber).toBe("U00000000");
  });

  it(`yields exactly ${EXPECTED_POSITIONS.length} open positions — no zombies, no missing`, () => {
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

  it("YTD statement emits one snapshot quote per open position with source IBKR_SNAPSHOT", () => {
    const { snapshotQuotes } = runPipeline();
    const symbols = snapshotQuotes.map((q) => q.symbol).sort();
    const expected = EXPECTED_POSITIONS.map((p) => p.ticker).sort();
    expect(symbols).toEqual(expected);
    expect(snapshotQuotes.every((q) => q.source === "IBKR_SNAPSHOT")).toBe(true);
  });

  it("snapshot close prices match IBKR's Open Positions section per symbol", () => {
    const { snapshotQuotes } = runPipeline();
    for (const exp of EXPECTED_POSITIONS) {
      const q = snapshotQuotes.find((qq) => qq.symbol === exp.ticker);
      expect(q, `missing quote for ${exp.ticker}`).toBeDefined();
      expect(Number(q!.close)).toBeCloseTo(exp.closePriceNative, 2);
      expect(q!.currency).toBe(exp.currency);
    }
  });
});
