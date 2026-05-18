import { describe, it, expect } from "vitest";
import { convertEventToEur } from "@/lib/ledger/fx";
import type { NormalizedEvent } from "@/lib/domain/types";

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    id: "e1",
    broker: "INTERACTIVE_BROKERS",
    accountNumber: "U1",
    type: "TRADE",
    date: "2024-06-01",
    currency: "EUR",
    ...overrides,
  };
}

describe("convertEventToEur — FX corner cases", () => {
  it("EUR event keeps amount unchanged and sets fxSource=BROKER", () => {
    const ev = makeEvent({ currency: "EUR", amount: "250" });
    const out = convertEventToEur(ev, new Map());
    expect(out.amountEur).toBe("250");
    expect(out.fxSource).toBe("BROKER");
    expect(out.requiresReview).toBeFalsy();
  });

  it("USD event with rate divides amount by rate", () => {
    const rates = new Map([["2024-06-01|USD", "1.08"]]);
    const ev = makeEvent({ currency: "USD", amount: "1080" });
    const out = convertEventToEur(ev, rates);
    expect(out.amountEur).toBe("1000.00");
    expect(out.fxSource).toBe("ECB");
  });

  it("missing rate yields fxSource=MISSING and requiresReview=true and no *_eur fields", () => {
    const rates = new Map<string, string>(); // empty
    const ev = makeEvent({ currency: "JPY", amount: "150000" });
    const out = convertEventToEur(ev, rates);
    expect(out.fxSource).toBe("MISSING");
    expect(out.requiresReview).toBe(true);
    expect(out.amountEur).toBeUndefined();
    expect(out.feeEur).toBeUndefined();
  });

  it("rate of exactly 1.0 produces same numeric values", () => {
    const rates = new Map([["2024-06-01|XYZ", "1.0"]]);
    const ev = makeEvent({ currency: "XYZ", amount: "500" });
    const out = convertEventToEur(ev, rates);
    expect(out.amountEur).toBe("500.00");
  });

  it("negative amount preserves sign after conversion", () => {
    const rates = new Map([["2024-06-01|USD", "1.25"]]);
    const ev = makeEvent({ currency: "USD", amount: "-250" });
    const out = convertEventToEur(ev, rates);
    expect(out.amountEur).toBe("-200.00");
  });

  it("very large amount (millions) converts without precision loss", () => {
    const rates = new Map([["2024-06-01|USD", "1.10"]]);
    const ev = makeEvent({ currency: "USD", amount: "11000000" });
    const out = convertEventToEur(ev, rates);
    expect(out.amountEur).toBe("10000000.00");
  });

  it("rate with 5 decimal places (e.g. 1.07423) is honored", () => {
    const rates = new Map([["2024-06-01|USD", "1.07423"]]);
    const ev = makeEvent({ currency: "USD", amount: "1074.23" });
    const out = convertEventToEur(ev, rates);
    // 1074.23 / 1.07423 ≈ 1000.00
    expect(Number(out.amountEur)).toBeCloseTo(1000.0, 1);
  });

  it("zero amount converts to '0.00'", () => {
    const rates = new Map([["2024-06-01|USD", "1.10"]]);
    const ev = makeEvent({ currency: "USD", amount: "0" });
    const out = convertEventToEur(ev, rates);
    expect(out.amountEur).toBe("0.00");
  });

  it("all six amount fields get *_eur companions when present", () => {
    const rates = new Map([["2024-06-01|USD", "2.00"]]);
    const ev = makeEvent({
      currency: "USD",
      amount: "200",
      cashAmount: "200",
      proceeds: "200",
      fee: "200",
      realizedPnl: "200",
      withholdingTax: "200",
    });
    const out = convertEventToEur(ev, rates);
    expect(out.amountEur).toBe("100.00");
    expect(out.cashAmountEur).toBe("100.00");
    expect(out.proceedsEur).toBe("100.00");
    expect(out.feeEur).toBe("100.00");
    expect(out.realizedPnlEur).toBe("100.00");
    expect(out.withholdingTaxEur).toBe("100.00");
  });

  it("undefined amount fields are skipped (no *_eur added)", () => {
    const rates = new Map([["2024-06-01|USD", "1.10"]]);
    // Only 'amount' is set; other fields are absent
    const ev = makeEvent({ currency: "USD", amount: "110" });
    const out = convertEventToEur(ev, rates);
    expect(out.cashAmountEur).toBeUndefined();
    expect(out.proceedsEur).toBeUndefined();
    expect(out.feeEur).toBeUndefined();
    expect(out.realizedPnlEur).toBeUndefined();
    expect(out.withholdingTaxEur).toBeUndefined();
  });

  it("rate < 1.0 (e.g. GBP at 0.84) results in amount divided by smaller number → larger EUR value", () => {
    // 1 GBP = 0.84 EUR/GBP rate means 1 GBP buys 1/0.84 EUR ≈ 1.19 EUR
    const rates = new Map([["2024-06-01|GBP", "0.84"]]);
    const ev = makeEvent({ currency: "GBP", amount: "84" });
    const out = convertEventToEur(ev, rates);
    // 84 / 0.84 = 100.00
    expect(out.amountEur).toBe("100.00");
    expect(Number(out.amountEur)).toBeGreaterThan(Number(ev.amount));
  });
});
