import { describe, expect, it } from "vitest";

import { computeEventFingerprint } from "@/lib/imports/fingerprint";
import type { NormalizedEvent } from "@/lib/domain/types";

const event: NormalizedEvent = {
  id: "broker-row-1",
  broker: "INTERACTIVE_BROKERS",
  accountNumber: "U000000",
  type: "TRADE",
  date: "2024-08-01",
  currency: "USD",
  symbol: "VUAA",
  isin: "IE00BFMXXD54",
  quantity: "-1",
  proceeds: "100",
  realizedPnl: "19",
  fee: "1",
  source: "Trades",
};

describe("event fingerprints", () => {
  it("are stable when non-identity metadata changes", () => {
    expect(computeEventFingerprint(event)).toBe(
      computeEventFingerprint({
        ...event,
        id: "different-parser-row-id",
        importedAt: "2026-05-16T10:00:00.000Z",
      }),
    );
  });

  it("change when financial identity changes", () => {
    expect(computeEventFingerprint(event)).not.toBe(
      computeEventFingerprint({
        ...event,
        proceeds: "101",
      }),
    );
  });
});
