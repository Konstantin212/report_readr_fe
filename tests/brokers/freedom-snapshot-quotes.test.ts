import { describe, it, expect } from "vitest";
import { parseFreedomFinanceStatement } from "@/lib/brokers/freedom";

function fixture(overrides: Record<string, unknown> = {}) {
  return new TextEncoder().encode(JSON.stringify({
    date_start: "2024-01-01 00:00:00",
    date_end: "2026-06-05 23:59:59",
    plainAccountInfoData: { account: "TEST123", currency: "EUR" },
    trades: { detailed: [] },
    cash_in_outs: [],
    account_at_end: {
      account: {
        positions_from_ts: {
          ps: {
            pos: [
              { i: "HOOD.US", q: 21, mkt_price: 84.06, curr: "USD" },
              { i: "VHYL.EU", q: 7, mkt_price: 51.34, curr: "EUR" },
              { i: "RY4C.EU", q: 50, mkt_price: 22.41, curr: "EUR" },
            ],
          },
        },
      },
    },
    ...overrides,
  })).buffer;
}

describe("Freedom snapshot-quote extraction", () => {
  it("captures one quote per held position with mkt_price + curr", () => {
    const parsed = parseFreedomFinanceStatement("test.json", fixture(), 2026);
    expect(parsed.snapshotQuotes).toEqual([
      { symbol: "HOOD", date: "2026-06-05", close: "84.06", currency: "USD", source: "FREEDOM_SNAPSHOT" },
      { symbol: "VHYL", date: "2026-06-05", close: "51.34", currency: "EUR", source: "FREEDOM_SNAPSHOT" },
      { symbol: "RY4C", date: "2026-06-05", close: "22.41", currency: "EUR", source: "FREEDOM_SNAPSHOT" },
    ]);
  });

  it("strips Freedom exchange suffixes from the ticker", () => {
    const parsed = parseFreedomFinanceStatement("test.json", fixture(), 2026);
    const symbols = parsed.snapshotQuotes?.map((q) => q.symbol);
    // No ".US" / ".EU" suffixes should leak through — has to match the
    // canonical form used in lots and positions tables.
    expect(symbols?.every((s) => !s.includes("."))).toBe(true);
  });

  it("uses statement end date (not today) so live API quotes still win in the orchestrator", () => {
    const parsed = parseFreedomFinanceStatement("test.json", fixture(), 2026);
    for (const q of parsed.snapshotQuotes ?? []) {
      expect(q.date).toBe("2026-06-05");
    }
  });

  it("skips rows with zero or missing prices", () => {
    const bytes = new TextEncoder().encode(JSON.stringify({
      date_end: "2026-06-05 23:59:59",
      plainAccountInfoData: { account: "TEST123", currency: "EUR" },
      account_at_end: {
        account: {
          positions_from_ts: {
            ps: {
              pos: [
                { i: "HOOD.US", q: 21, mkt_price: 84.06, curr: "USD" },
                { i: "DEAD.US", q: 0, mkt_price: 0, curr: "USD" },        // dropped
                { i: "NOPRICE.US", q: 5, mkt_price: null, curr: "USD" },  // dropped
                { i: "VHYL.EU", q: 7, mkt_price: 51.34, curr: "EUR" },
              ],
            },
          },
        },
      },
    })).buffer;
    const parsed = parseFreedomFinanceStatement("test.json", bytes, 2026);
    expect(parsed.snapshotQuotes?.map((q) => q.symbol)).toEqual(["HOOD", "VHYL"]);
  });

  it("re-keys snapshot to trade ticker when company name matches (Ryanair RYA→RY4C case)", () => {
    // FF reports Ryanair as `RYA.EU` in account_at_end but as
    // `RY4C.EU` in the trades section. Both rows carry the same
    // company name, which we can use to re-key the snapshot quote.
    const bytes = new TextEncoder().encode(JSON.stringify({
      date_end: "2026-06-06 23:59:59",
      plainAccountInfoData: { client_code: "201743" },
      trades: {
        detailed: [
          {
            id: "t1",
            short_date: "2024-07-04 10:00:00",
            // FF puts the ticker (with exchange suffix) here, not the
            // company name — the company name only exists on snapshot
            // rows. ISIN is what bridges the two.
            instr_nm: "RY4C.EU",
            operation: "buy",
            curr_c: "EUR",
            q: "8",
            p: "16.62",
            summ: "-132.95",
            isin: "IE00BYTBXV33",
          },
        ],
      },
      account_at_end: {
        account: {
          positions_from_ts: {
            ps: {
              pos: [
                // FF snapshot ticker is RYA.EU, but the user's lot is RY4C.
                // Both rows share the same ISIN (IE00BYTBXV33).
                { i: "RYA.EU", q: 8, mkt_price: 23.88, curr: "EUR", issue_nb: "IE00BYTBXV33" },
              ],
            },
          },
        },
      },
    })).buffer;
    const parsed = parseFreedomFinanceStatement("test.json", bytes, 2026);
    expect(parsed.snapshotQuotes).toEqual([
      { symbol: "RY4C", date: "2026-06-06", close: "23.88", currency: "EUR", source: "FREEDOM_SNAPSHOT" },
    ]);
  });

  it("returns an empty array when the statement has no account_at_end section", () => {
    const bytes = new TextEncoder().encode(JSON.stringify({
      date_end: "2026-06-05 23:59:59",
      plainAccountInfoData: { account: "TEST123" },
    })).buffer;
    const parsed = parseFreedomFinanceStatement("test.json", bytes, 2026);
    expect(parsed.snapshotQuotes).toEqual([]);
  });
});
