import { desc, eq } from "drizzle-orm";
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

type Db = ReturnType<typeof getDb>;
type LatestFx = Map<string, { rate: number; date: string }>;

/**
 * Latest ECB rate per currency. fx_rates holds ~50k daily rows; the app
 * only ever needs the newest rate per currency, so pull one row per
 * currency with DISTINCT ON instead of the whole table (the difference
 * between ~12 rows and ~51k rows on every positions/cash render).
 */
export async function loadLatestFxPerCurrency(db: Db): Promise<LatestFx> {
  const rows = await db
    .selectDistinctOn([fxRates.fromCurrency], {
      fromCurrency: fxRates.fromCurrency,
      rate: fxRates.rate,
      date: fxRates.date,
    })
    .from(fxRates)
    .orderBy(fxRates.fromCurrency, desc(fxRates.date));
  const m: LatestFx = new Map();
  for (const r of rows) m.set(r.fromCurrency, { rate: Number(r.rate), date: r.date });
  return m;
}

export async function getCashBalances(
  ownerUserId: string,
  broker: "all" | "ff" | "ibkr" = "all",
): Promise<CashByCurrency[]> {
  const db = getDb();
  const [accountRows, allTx, latestFx] = await Promise.all([
    db.select().from(brokerAccounts).where(eq(brokerAccounts.ownerUserId, ownerUserId)),
    db.select().from(transactions).where(eq(transactions.ownerUserId, ownerUserId)),
    loadLatestFxPerCurrency(db),
  ]);
  return computeCashBalances({ accountRows, txs: allTx, latestFx, broker });
}

/**
 * Pure cash-balance computation from already-loaded rows. `getPositionsData`
 * calls this directly with the accountRows / transactions / latest-FX it has
 * already fetched, so the positions page no longer re-queries fx_rates (51k
 * rows) and all transactions a second time just for the cash card.
 */
export function computeCashBalances(opts: {
  accountRows: Array<typeof brokerAccounts.$inferSelect>;
  txs: Array<typeof transactions.$inferSelect>;
  latestFx: LatestFx;
  broker?: "all" | "ff" | "ibkr";
}): CashByCurrency[] {
  const { accountRows, txs: allTx, latestFx, broker = "all" } = opts;
  const accountFilter = broker === "all" ? null : broker === "ff" ? "FREEDOM_FINANCE" : "INTERACTIVE_BROKERS";
  const accountIds = accountFilter
    ? accountRows.filter(a => a.broker === accountFilter).map(a => a.id)
    : accountRows.map(a => a.id);
  const accountIdsSet = new Set(accountIds);

  const txs = accountFilter
    ? allTx.filter(t => t.brokerAccountId && accountIdsSet.has(t.brokerAccountId))
    : allTx;

  // Per (brokerAccount, currency) → latest CASH_REPORT_ENDING snapshot.
  // When present, this is IBKR's authoritative ending balance and we
  // bypass event-summing for that (brokerAccount, currency) pair entirely
  // — the snapshot already reflects every fee class, FX translation
  // adjustment, and day-of-statement timing quirk IBKR applies.
  type SnapKey = string; // `${brokerAccountId}|${currency}`
  const snapshots = new Map<SnapKey, { date: string; amount: Decimal }>();
  for (const t of txs) {
    if (t.source !== "CASH_REPORT_ENDING" || !t.brokerAccountId) continue;
    const key = `${t.brokerAccountId}|${t.currency || "EUR"}`;
    const prev = snapshots.get(key);
    if (!prev || t.eventDate > prev.date) {
      snapshots.set(key, { date: t.eventDate, amount: new Decimal(t.cashAmount ?? "0") });
    }
  }
  const snapshottedKeys = new Set(snapshots.keys());

  const totals = new Map<string, Decimal>();
  // Seed totals from snapshots (authoritative per-account per-currency balance).
  for (const [key, snap] of snapshots) {
    const currency = key.split("|")[1];
    totals.set(currency, (totals.get(currency) ?? new Decimal(0)).plus(snap.amount));
  }

  for (const t of txs) {
    if (t.source === "CASH_REPORT_ENDING") continue; // already seeded
    // Skip events for (brokerAccount, currency) pairs that have a snapshot —
    // those are already represented by the IBKR-authoritative ending balance.
    const baKey = t.brokerAccountId ? `${t.brokerAccountId}|${t.currency || "EUR"}` : null;
    if (baKey && snapshottedKeys.has(baKey)) continue;

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

  const out: CashByCurrency[] = [];
  for (const [currency, total] of totals) {
    const amount = Number(total);
    if (Math.abs(amount) < 0.005) continue;          // hide near-zero balances
    let amountEur = amount;
    if (currency !== "EUR") {
      const fx = latestFx.get(currency);
      amountEur = fx ? amount / fx.rate : 0;
    }
    out.push({ currency, amount, amountEur, flag: FLAG[currency] });
  }
  out.sort((a, b) => Math.abs(b.amountEur) - Math.abs(a.amountEur));
  return out;
}
