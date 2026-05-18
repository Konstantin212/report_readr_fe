import Decimal from "decimal.js";
import type { NormalizedEvent } from "@/lib/domain/types";

const AMOUNT_FIELDS = ["amount", "cashAmount", "proceeds", "fee", "realizedPnl", "withholdingTax"] as const;

export function convertEventToEur(event: NormalizedEvent, rates: Map<string, string>): NormalizedEvent {
  if (event.currency === "EUR") {
    const out: NormalizedEvent = { ...event, fxSource: "BROKER" };
    for (const f of AMOUNT_FIELDS) {
      const v = event[f];
      if (v !== undefined) (out as Record<string, unknown>)[`${f}Eur`] = v;
    }
    return out;
  }

  const rate = rates.get(`${event.date}|${event.currency}`);
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
