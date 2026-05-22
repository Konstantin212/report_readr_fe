import { describe, expect, it } from "vitest";

import type { CoinbaseAccount, CoinbaseTransaction } from "@/lib/crypto/coinbase";
import { mapCoinbaseTransaction } from "@/lib/crypto/mapper";

const ACCOUNT: CoinbaseAccount = {
  id: "wallet-eth",
  name: "ETH Wallet",
  primary: true,
  type: "wallet",
  currency: { code: "ETH", name: "Ethereum" },
  balance: { amount: "1.5", currency: "ETH" },
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2026-05-01T00:00:00Z",
};

function tx(overrides: Partial<CoinbaseTransaction>): CoinbaseTransaction {
  return {
    id: "tx-1",
    type: "staking_reward",
    status: "completed",
    amount: { amount: "0.0012", currency: "ETH" },
    native_amount: { amount: "3.50", currency: "EUR" },
    created_at: "2026-05-15T10:00:00Z",
    updated_at: "2026-05-15T10:00:00Z",
    ...overrides,
  };
}

describe("crypto/mapper", () => {
  it("maps staking_reward → CRYPTO_STAKE_REWARD with native value at receipt", () => {
    const ev = mapCoinbaseTransaction(tx({}), ACCOUNT, "ca-1");
    expect(ev?.type).toBe("CRYPTO_STAKE_REWARD");
    expect(ev?.symbol).toBe("ETH");
    expect(ev?.quantity).toBe("0.0012");
    expect(ev?.amount).toBe("3.50");
    expect(ev?.currency).toBe("EUR");
    expect(ev?.date).toBe("2026-05-15");
    expect(ev?.broker).toBe("COINBASE");
    expect(ev?.accountNumber).toBe("ca-1");
    // EUR conversion is downstream (lib/ledger/fx) — mapper just normalizes.
    expect(ev?.amountEur).toBeUndefined();
  });

  it("treats interest and inflation_reward as staking equivalents for Anlage SO", () => {
    expect(mapCoinbaseTransaction(tx({ type: "interest" }), ACCOUNT, "ca-1")?.type).toBe("CRYPTO_STAKE_REWARD");
    expect(mapCoinbaseTransaction(tx({ type: "inflation_reward" }), ACCOUNT, "ca-1")?.type).toBe(
      "CRYPTO_STAKE_REWARD",
    );
  });

  it("maps buy/sell/trade → TRADE", () => {
    for (const t of ["buy", "sell", "trade", "advanced_trade_fill"]) {
      const ev = mapCoinbaseTransaction(tx({ type: t }), ACCOUNT, "ca-1");
      expect(ev?.type).toBe("TRADE");
    }
  });

  it("strips the minus sign from outgoing amounts so qty/EUR are always positive", () => {
    const ev = mapCoinbaseTransaction(
      tx({ amount: { amount: "-0.0012", currency: "ETH" }, native_amount: { amount: "-3.50", currency: "EUR" } }),
      ACCOUNT,
      "ca-1",
    );
    expect(ev?.quantity).toBe("0.0012");
    expect(ev?.amount).toBe("3.50");
  });

  it("returns null for skip-list types (send/receive/transfer/fiat_*)", () => {
    for (const t of ["send", "receive", "transfer", "fiat_deposit", "fiat_withdrawal", "exchange_deposit"]) {
      expect(mapCoinbaseTransaction(tx({ type: t }), ACCOUNT, "ca-1")).toBeNull();
    }
  });

  it("returns null for transactions whose status is not completed", () => {
    expect(mapCoinbaseTransaction(tx({ status: "pending" }), ACCOUNT, "ca-1")).toBeNull();
    expect(mapCoinbaseTransaction(tx({ status: "failed" }), ACCOUNT, "ca-1")).toBeNull();
  });

  it("passes through non-EUR native_amount unchanged for the converter to handle", () => {
    const ev = mapCoinbaseTransaction(
      tx({ native_amount: { amount: "4.00", currency: "USD" } }),
      ACCOUNT,
      "ca-1",
    );
    expect(ev?.currency).toBe("USD");
    expect(ev?.amount).toBe("4.00");
    expect(ev?.amountEur).toBeUndefined();
    expect(ev?.fxSource).toBeUndefined();
    expect(ev?.requiresReview).toBeUndefined();
  });
});
