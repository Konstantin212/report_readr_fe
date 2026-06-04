import Decimal from "decimal.js";
import type { NormalizedEvent } from "@/lib/domain/types";

const AMOUNT_FIELDS = ["amount", "cashAmount", "proceeds", "fee", "realizedPnl", "withholdingTax"] as const;

/**
 * ECB publishes business-day-only. Events that fall on weekends or
 * holidays (most relevant for crypto staking, which pays daily) need to
 * fall back to the nearest preceding publication — this is the standard
 * Finanzamt convention. We look back up to 7 calendar days to span long
 * weekends + holidays.
 */
const FX_LOOKBACK_DAYS = 7;

function lookupRate(rates: Map<string, string>, currency: string, date: string): string | undefined {
  const direct = rates.get(`${date}|${currency}`);
  if (direct) return direct;
  const d = new Date(`${date}T00:00:00Z`);
  for (let back = 1; back <= FX_LOOKBACK_DAYS; back++) {
    d.setUTCDate(d.getUTCDate() - 1);
    const iso = d.toISOString().slice(0, 10);
    const r = rates.get(`${iso}|${currency}`);
    if (r) return r;
  }
  return undefined;
}

export function convertEventToEur(event: NormalizedEvent, rates: Map<string, string>): NormalizedEvent {
  // Fast path: everything is already in EUR. Copy native amounts to EUR.
  if (event.currency === "EUR" && (!event.feeCurrency || event.feeCurrency === "EUR")) {
    const out: NormalizedEvent = { ...event, fxSource: "BROKER" };
    for (const f of AMOUNT_FIELDS) {
      const v = event[f];
      if (v !== undefined) (out as Record<string, unknown>)[`${f}Eur`] = v;
    }
    return out;
  }

  // Convert the main amount via the trade currency's rate. EUR-denominated
  // trades skip the lookup (rate == 1).
  let amountRate: Decimal | null = null;
  if (event.currency === "EUR") {
    amountRate = new Decimal(1);
  } else {
    const r = lookupRate(rates, event.currency, event.date);
    if (!r) return { ...event, fxSource: "MISSING", requiresReview: true };
    amountRate = new Decimal(r);
  }

  // If the fee lives in a different currency, look up its rate
  // separately. Missing fee rate → flag for review.
  const feeCurrency = event.feeCurrency;
  let feeRate: Decimal | null = null;
  if (feeCurrency && feeCurrency !== event.currency) {
    if (feeCurrency === "EUR") {
      feeRate = new Decimal(1);
    } else {
      const r = lookupRate(rates, feeCurrency, event.date);
      if (!r) return { ...event, fxSource: "MISSING", requiresReview: true };
      feeRate = new Decimal(r);
    }
  }

  const out: NormalizedEvent = { ...event, fxSource: "ECB" };
  for (const f of AMOUNT_FIELDS) {
    const v = event[f];
    if (v === undefined) continue;
    const rate = f === "fee" && feeRate !== null ? feeRate : amountRate;
    (out as Record<string, unknown>)[`${f}Eur`] = new Decimal(v).div(rate).toFixed(2);
  }

  // When fee uses its own currency, the native cashAmount intentionally
  // omits the fee (mixing currencies in one field would be meaningless).
  // Reconstruct cashAmountEur from the EUR components so the cost basis
  // reflects the full out-of-pocket cost.
  if (feeRate !== null) {
    const amountEur = out.amountEur ? new Decimal(out.amountEur) : new Decimal(0);
    const feeEur = out.feeEur ? new Decimal(out.feeEur) : new Decimal(0);
    // amount is signed (negative for a buy); fee is positive; out-of-pocket
    // is amount - fee (so a buy of -1789.81 with fee 10.56 → -1800.37).
    out.cashAmountEur = amountEur.minus(feeEur).toFixed(2);
  }

  return out;
}
