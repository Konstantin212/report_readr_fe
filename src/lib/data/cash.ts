import { eq } from "drizzle-orm";
import Decimal from "decimal.js";
import { getDb } from "@/lib/db/client";
import { brokerAccounts, transactions, fxRates } from "@/lib/db/schema";

export type CashByCurrency = {
  currency: string;
  amount: number;          // native currency
  amountEur: number;        // converted using latest ECB rate (best-effort)
  flag?: string;
};

const FLAG: Record<string, string> = {
  EUR: "🇪🇺", USD: "🇺🇸", GBP: "🇬🇧", HKD: "🇭🇰", CHF: "🇨🇭", JPY: "🇯🇵", SEK: "🇸🇪",
};

export async function getCashBalances(
  ownerUserId: string,
  broker: "all" | "ff" | "ibkr" = "all",
): Promise<CashByCurrency[]> {
  const db = getDb();
  const accountFilter = broker === "all" ? null : broker === "ff" ? "FREEDOM_FINANCE" : "INTERACTIVE_BROKERS";
  const accountRows = await db.select().from(brokerAccounts).where(eq(brokerAccounts.ownerUserId, ownerUserId));
  const accountIds = accountFilter
    ? accountRows.filter(a => a.broker === accountFilter).map(a => a.id)
    : accountRows.map(a => a.id);
  const accountIdsSet = new Set(accountIds);

  const allTx = await db.select().from(transactions).where(eq(transactions.ownerUserId, ownerUserId));
  const txs = accountFilter
    ? allTx.filter(t => t.brokerAccountId && accountIdsSet.has(t.brokerAccountId))
    : allTx;

  const totals = new Map<string, Decimal>();
  for (const t of txs) {
    // Use cashAmount (signed) when present; otherwise fall back to amount with type-specific sign convention.
    let signed: Decimal | null = null;
    if (t.cashAmount !== null && t.cashAmount !== undefined) {
      signed = new Decimal(t.cashAmount);
    } else {
      switch (t.eventType) {
        case "CASH_TRANSFER":
        case "DIVIDEND":
        case "INTEREST":
        case "TRADE":
        case "FX_CONVERSION":
        case "CORPORATE_ACTION":
          signed = t.amount ? new Decimal(t.amount) : null;
          break;
        case "FEE":
        case "WITHHOLDING_TAX":
          signed = t.amount ? new Decimal(t.amount).neg() : null;
          break;
        default:
          signed = null;
      }
    }
    if (signed === null) continue;
    const currency = t.currency || "EUR";
    if (currency === "BASE") continue; // IBKR "BASE" rollups should not double-count
    totals.set(currency, (totals.get(currency) ?? new Decimal(0)).plus(signed));
  }

  // Latest fx per currency for EUR conversion
  const allFx = await db.select().from(fxRates);
  const byCurrencyLatest = new Map<string, { rate: number; date: string }>();
  for (const r of allFx) {
    const prev = byCurrencyLatest.get(r.fromCurrency);
    if (!prev || r.date > prev.date) byCurrencyLatest.set(r.fromCurrency, { rate: Number(r.rate), date: r.date });
  }

  const out: CashByCurrency[] = [];
  for (const [currency, total] of totals) {
    const amount = Number(total);
    if (Math.abs(amount) < 0.005) continue;          // hide near-zero balances
    let amountEur = amount;
    if (currency !== "EUR") {
      const fx = byCurrencyLatest.get(currency);
      amountEur = fx ? amount / fx.rate : 0;
    }
    out.push({ currency, amount, amountEur, flag: FLAG[currency] });
  }
  out.sort((a, b) => Math.abs(b.amountEur) - Math.abs(a.amountEur));
  return out;
}
