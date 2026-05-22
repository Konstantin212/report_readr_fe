import { describe, expect, it } from "vitest";

import type { AnlageSoDraft } from "@/lib/tax/anlage-so";
import { renderAnlageSoCsv } from "@/lib/tax/export-csv-so";

function draft(overrides: Partial<AnlageSoDraft> = {}): AnlageSoDraft {
  return {
    taxYear: 2026,
    taxpayerName: "K. Prikhodko",
    total: {
      stakingIncomeEur: 0,
      eventCount: 0,
      section23ShortTermGainEur: 0,
      section23LongTermTaxFreeEur: 0,
      section23MatchCount: 0,
      freigrenzeEur: 256,
      freigrenzeReached: false,
      taxableEur: 0,
    },
    perCoin: [],
    events: [],
    section23Matches: [],
    generatedAt: "2026-05-22T00:00:00Z",
    ...overrides,
  };
}

describe("export-csv-so", () => {
  it("emits a header row followed by one row per payout", () => {
    const out = renderAnlageSoCsv(
      draft({
        events: [
          {
            date: "2026-05-15",
            symbol: "ETH",
            quantity: 0.0012,
            eurValue: 3.5,
            description: "Reward",
            coinbaseId: "tx-abc",
            walletName: "Staked ETH",
            fxSource: "ECB",
          },
        ],
      }),
    );
    const [header, row] = out.trim().split("\r\n");
    expect(header).toBe(
      "date,coin,quantity,eur_value_at_receipt,eur_price_per_unit,wallet,fx_source,coinbase_tx_id,description",
    );
    expect(row).toBe("2026-05-15,ETH,0.00120000,3.5000,2916.66666667,Staked ETH,ECB,tx-abc,Reward");
  });

  it("escapes commas and quotes in description and wallet fields", () => {
    const out = renderAnlageSoCsv(
      draft({
        events: [
          {
            date: "2026-05-15",
            symbol: "ATOM",
            quantity: 1,
            eurValue: 2,
            description: 'has, comma and "quotes"',
            coinbaseId: "tx-1",
            walletName: "wallet, one",
            fxSource: "ECB",
          },
        ],
      }),
    );
    const row = out.trim().split("\r\n")[1];
    expect(row).toContain('"has, comma and ""quotes"""');
    expect(row).toContain('"wallet, one"');
  });

  it("emits empty cells (not 'null') for missing fields", () => {
    const out = renderAnlageSoCsv(
      draft({
        events: [
          {
            date: "2026-05-15",
            symbol: "ADA",
            quantity: 0,
            eurValue: 0,
            description: null,
            coinbaseId: null,
            walletName: null,
            fxSource: null,
          },
        ],
      }),
    );
    const row = out.trim().split("\r\n")[1];
    // quantity=0 means we can't compute eur_price_per_unit; should be blank
    expect(row.split(",")[4]).toBe("");
    expect(row).not.toContain("null");
  });
});
