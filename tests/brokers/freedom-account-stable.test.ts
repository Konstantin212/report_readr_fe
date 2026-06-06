import { describe, it, expect } from "vitest";
import { parseFreedomFinanceStatement } from "@/lib/brokers/freedom";

/**
 * Account-number stability regression. Two FF statements with
 * different filenames (different period) must map to the SAME
 * broker_account when the underlying `client_code` is identical —
 * otherwise every re-upload silently creates a duplicate
 * broker_account and the portfolio doubles itself in the UI.
 */

function fixtureWithClientCode(clientCode: string, fileName: string) {
  return new TextEncoder().encode(JSON.stringify({
    date_start: "2024-01-01 00:00:00",
    date_end: "2026-06-06 23:59:59",
    plainAccountInfoData: { client_code: clientCode, base_currency: "EUR" },
    trades: { detailed: [] },
    cash_in_outs: [],
  })).buffer;
}

describe("Freedom account-number stability", () => {
  it("uses plainAccountInfoData.client_code as the account number", () => {
    const parsed = parseFreedomFinanceStatement(
      "201743_2026-05-16_all.json",
      fixtureWithClientCode("201743", "any.json"),
      2026,
    );
    expect(parsed.account.accountNumber).toBe("201743");
  });

  it("returns the same accountNumber for two uploads with different filenames", () => {
    // Same user, same FF account — only the statement date in the
    // filename differs. The DB upsert keys broker_accounts on
    // (owner, broker, accountNumber); equal accountNumber → one
    // broker_account row.
    const may = parseFreedomFinanceStatement(
      "201743_2021-04-30_2026-05-16_all.json",
      fixtureWithClientCode("201743", ""),
      2026,
    );
    const jun = parseFreedomFinanceStatement(
      "201743_2021-04-30_2026-06-06_all.json",
      fixtureWithClientCode("201743", ""),
      2026,
    );
    expect(may.account.accountNumber).toBe(jun.account.accountNumber);
    expect(may.account.accountNumber).toBe("201743");
  });

  it("falls back to legacy account/account_id keys when client_code is missing", () => {
    const bytes = new TextEncoder().encode(JSON.stringify({
      date_end: "2026-06-06 23:59:59",
      plainAccountInfoData: { account: "ACCT-LEGACY-7" },
    })).buffer;
    const parsed = parseFreedomFinanceStatement("anything.json", bytes, 2026);
    expect(parsed.account.accountNumber).toBe("ACCT-LEGACY-7");
  });

  it("falls back to filename only when every account field is missing", () => {
    const bytes = new TextEncoder().encode(JSON.stringify({
      date_end: "2026-06-06 23:59:59",
      plainAccountInfoData: {},
    })).buffer;
    const parsed = parseFreedomFinanceStatement("legacy_no_id.json", bytes, 2026);
    expect(parsed.account.accountNumber).toBe("legacy_no_id-json");
  });

  it("reads base_currency when currency is absent", () => {
    const bytes = new TextEncoder().encode(JSON.stringify({
      date_end: "2026-06-06 23:59:59",
      plainAccountInfoData: { client_code: "201743", base_currency: "EUR" },
    })).buffer;
    const parsed = parseFreedomFinanceStatement("test.json", bytes, 2026);
    expect(parsed.account.baseCurrency).toBe("EUR");
  });
});
