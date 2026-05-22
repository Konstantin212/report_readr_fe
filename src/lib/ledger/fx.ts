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
  if (event.currency === "EUR") {
    const out: NormalizedEvent = { ...event, fxSource: "BROKER" };
    for (const f of AMOUNT_FIELDS) {
      const v = event[f];
      if (v !== undefined) (out as Record<string, unknown>)[`${f}Eur`] = v;
    }
    return out;
  }

  const rate = lookupRate(rates, event.currency, event.date);
  if (!rate) return { ...event, fxSource: "MISSING", requiresReview: true };

  const out: NormalizedEvent = { ...event, fxSource: "ECB" };
  const r = new Decimal(rate);
  for (const f of AMOUNT_FIELDS) {
    const v = event[f];
    if (v === undefined) continue;
    (out as Record<string, unknown>)[`${f}Eur`] = new Decimal(v).div(r).toFixed(2);
  }
  return out;
}
