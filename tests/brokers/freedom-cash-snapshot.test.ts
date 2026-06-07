/**
 * Freedom cash-snapshot extraction.
 *
 * FF's JSON exposes the authoritative per-currency ending balance under
 * `cash_flows_json` (top-level, separate from `cash_flows.detailed`).
 * The parser emits one CASH_TRANSFER event per currency with
 * source="CASH_REPORT_ENDING" — the same marker IBKR uses — so the
 * cash accessor treats it as a snapshot and bypasses event-summing.
 */
import { describe, it, expect } from "vitest";
import { parseFreedomFinanceStatement } from "@/lib/brokers/freedom";

function fixture(): ArrayBuffer {
  return new TextEncoder().encode(JSON.stringify({
    date_start: "2021-04-30 23:59:59",
    date_end: "2026-06-06 23:59:59",
    plainAccountInfoData: { client_code: "900000", currency: "EUR" },
    cash_flows_json: [
      { date_start: "2021-04-30", date_end: "2026-06-06", curr: "EUR", curr_at_end: 5.13 },
      { date_start: "2021-04-30", date_end: "2026-06-06", curr: "RUR", curr_at_end: 0 },
      { date_start: "2021-04-30", date_end: "2026-06-06", curr: "USD", curr_at_end: 36.79 },
    ],
  })).buffer as ArrayBuffer;
}

describe("Freedom cash-snapshot extraction", () => {
  it("emits one CASH_TRANSFER event per currency with source=CASH_REPORT_ENDING", () => {
    const parsed = parseFreedomFinanceStatement("test.json", fixture(), 2026);
    const snaps = parsed.events.filter((e) => e.source === "CASH_REPORT_ENDING");
    expect(snaps.length).toBe(3);
    for (const e of snaps) {
      expect(e.type).toBe("CASH_TRANSFER");
      expect(e.broker).toBe("FREEDOM_FINANCE");
      expect(e.date).toBe("2026-06-06");
    }
  });

  it("captures the broker's ending balance verbatim — no transaction summing", () => {
    const parsed = parseFreedomFinanceStatement("test.json", fixture(), 2026);
    const byCcy = new Map(
      parsed.events
        .filter((e) => e.source === "CASH_REPORT_ENDING")
        .map((e) => [e.currency, e.cashAmount]),
    );
    expect(byCcy.get("EUR")).toBe("5.13");
    expect(byCcy.get("USD")).toBe("36.79");
    expect(byCcy.get("RUR")).toBe("0");
  });

  it("returns no snapshot events when cash_flows_json is missing", () => {
    const bytes = new TextEncoder().encode(JSON.stringify({
      date_end: "2026-06-06 23:59:59",
      plainAccountInfoData: { client_code: "900000" },
    })).buffer as ArrayBuffer;
    const parsed = parseFreedomFinanceStatement("test.json", bytes, 2026);
    expect(parsed.events.filter((e) => e.source === "CASH_REPORT_ENDING")).toEqual([]);
  });
});
