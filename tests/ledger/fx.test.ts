import { describe, it, expect } from "vitest";
import { convertEventToEur } from "@/lib/ledger/fx";
import type { NormalizedEvent } from "@/lib/domain/types";

const rates = new Map([["2025-03-04|USD", "1.075"], ["2025-04-15|GBP", "0.864"]]);

describe("convertEventToEur", () => {
  it("returns event with *_eur fields when rate present", () => {
    const ev: NormalizedEvent = { id: "1", broker: "INTERACTIVE_BROKERS", accountNumber: "U", type: "TRADE",
      date: "2025-03-04", currency: "USD", amount: "1075", fee: "1.075" };
    const out = convertEventToEur(ev, rates);
    expect(out.amountEur).toBe("1000.00");
    expect(out.feeEur).toBe("1.00");
    expect(out.fxSource).toBe("ECB");
    expect(out.requiresReview).toBeFalsy();
  });

  it("flags requires_review when rate missing", () => {
    const ev: NormalizedEvent = { id: "2", broker: "INTERACTIVE_BROKERS", accountNumber: "U", type: "TRADE",
      date: "2025-03-04", currency: "JPY", amount: "100" };
    const out = convertEventToEur(ev, rates);
    expect(out.amountEur).toBeUndefined();
    expect(out.fxSource).toBe("MISSING");
    expect(out.requiresReview).toBe(true);
  });

  it("passes through EUR events unchanged", () => {
    const ev: NormalizedEvent = { id: "3", broker: "INTERACTIVE_BROKERS", accountNumber: "U", type: "DIVIDEND",
      date: "2025-03-04", currency: "EUR", amount: "100" };
    const out = convertEventToEur(ev, rates);
    expect(out.amountEur).toBe("100");
    expect(out.fxSource).toBe("BROKER");
  });
});
