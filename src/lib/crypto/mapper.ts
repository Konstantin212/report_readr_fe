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
  const eventType = classify(tx.type, tx.amount.amount);
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

/**
 * Classify a Coinbase v2 transaction by economic effect. Buy/sell split
 * matters for §23 EStG private sale gains — the German 1-year holding
 * period turns on knowing when each lot was opened. Generic "trade"
 * events (USDC↔BTC swaps etc.) get classified based on amount sign in
 * the caller, since the v2 API doesn't always set buy/sell explicitly.
 */
function classify(coinbaseType: string, amount: string): NormalizedEvent["type"] | null {
  switch (coinbaseType) {
    case "buy":
      return "CRYPTO_BUY";
    case "sell":
      return "CRYPTO_SELL";
    case "trade":
    case "advanced_trade_fill":
      // For a generic trade event, the wallet's signed amount tells us
      // which side this is: positive = receiving (buy), negative = sending
      // (sell). A USDC→BTC swap emits both: one event in each wallet.
      return amount.trim().startsWith("-") ? "CRYPTO_SELL" : "CRYPTO_BUY";
    case "staking_reward":
    case "interest":
    case "inflation_reward":
      // §22 Nr. 3 EStG income at time of receipt, reported on Anlage SO.
      return "CRYPTO_STAKE_REWARD";
    default:
      // send / receive / transfer / fiat_deposit / fiat_withdrawal /
      // exchange_deposit / exchange_withdrawal — skipped (no cost-basis
      // impact for a buy-and-hold wallet, and v2 doesn't always price).
      return null;
  }
}

function stripSign(amount: string): string {
  const trimmed = amount.trim();
  return trimmed.startsWith("-") ? trimmed.slice(1) : trimmed;
}
