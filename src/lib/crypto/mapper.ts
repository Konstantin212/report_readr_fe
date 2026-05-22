import type { CoinbaseAccount, CoinbaseTransaction } from "@/lib/crypto/coinbase";
import type { NormalizedEvent } from "@/lib/domain/types";

/**
 * Translate one Coinbase v2 transaction into a NormalizedEvent. Returns
 * null for types that don't matter for our use case (e.g. fiat deposits,
 * exchange transfers). The accountNumber is set to the crypto_account
 * UUID so the existing transactions/broker_accounts schema can hold
 * these without further change.
 */
export function mapCoinbaseTransaction(
  tx: CoinbaseTransaction,
  account: CoinbaseAccount,
  brokerAccountNumber: string,
): NormalizedEvent | null {
  const eventType = classify(tx.type);
  if (!eventType) return null;
  if (tx.status && tx.status !== "completed") return null;

  // Coinbase reports amount.amount as a signed string in the native asset
  // unit (e.g. "0.00123456" BTC, negative for outgoing). native_amount is
  // in the user's display currency — for our DE flows that's EUR, but we
  // record the currency explicitly so a non-EUR setup still works.
  const amountRaw = tx.amount.amount;
  const qty = stripSign(amountRaw);
  const eurValue = stripSign(tx.native_amount.amount);
  const date = tx.created_at.slice(0, 10);
  const symbol = account.currency.code;

  // We leave EUR conversion to the downstream FX helper (lib/ledger/fx).
  // The mapper only normalizes shape; sync looks up the ECB rate by date
  // and fills amountEur, requiresReview, and fxSource consistently with
  // the stock brokers.
  return {
    id: tx.id,
    broker: "COINBASE",
    accountNumber: brokerAccountNumber,
    type: eventType,
    date,
    currency: tx.native_amount.currency,
    source: "COINBASE",
    symbol,
    name: account.name ?? symbol,
    description: tx.details?.title ?? tx.description,
    quantity: qty,
    amount: eurValue,
  };
}

function classify(coinbaseType: string): NormalizedEvent["type"] | null {
  switch (coinbaseType) {
    case "buy":
    case "sell":
    case "trade":
    case "advanced_trade_fill":
      return "TRADE";
    case "staking_reward":
    case "interest":
    case "inflation_reward":
      // All of these are "income at time of receipt" for German tax —
      // §22 Nr. 3 EStG, reported on Anlage SO.
      return "CRYPTO_STAKE_REWARD";
    default:
      // send / receive / transfer / fiat_deposit / fiat_withdrawal /
      // exchange_deposit / exchange_withdrawal / etc. — we deliberately
      // skip these. They don't affect cost basis for a buy-and-hold
      // wallet, and v2 doesn't always price them.
      return null;
  }
}

function stripSign(amount: string): string {
  const trimmed = amount.trim();
  return trimmed.startsWith("-") ? trimmed.slice(1) : trimmed;
}
