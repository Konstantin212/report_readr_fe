import Decimal from "decimal.js";

import { decimal, moneyString } from "@/lib/domain/decimal";
import type { NormalizedEvent } from "@/lib/domain/types";

export type GermanTaxDraftLines = {
  capitalIncome: string;
  stockLosses: string;
  foreignWithholdingTax: string;
};

export type GermanTaxEvidenceItem = {
  eventId: string;
  date: string;
  broker: NormalizedEvent["broker"];
  accountNumber: string;
  type: NormalizedEvent["type"];
  currency: string;
  amount: string;
  line: keyof GermanTaxDraftLines;
  symbol?: string;
  isin?: string;
};

export type GermanTaxDraft = {
  taxYear: number;
  lines: GermanTaxDraftLines;
  evidence: GermanTaxEvidenceItem[];
  reviewItems: GermanTaxReviewItem[];
  filingReady: boolean;
};

export type GermanTaxReviewItem = {
  eventId: string;
  message: string;
};

export function buildGermanTaxDraft({
  taxYear,
  events,
}: {
  taxYear: number;
  events: NormalizedEvent[];
}): GermanTaxDraft {
  let capitalIncome = new Decimal(0);
  let stockLosses = new Decimal(0);
  let foreignWithholdingTax = new Decimal(0);
  const evidence: GermanTaxEvidenceItem[] = [];
  const reviewItems: GermanTaxReviewItem[] = [];

  for (const event of events) {
    if (!event.date.startsWith(`${taxYear}-`)) {
      continue;
    }

    if (event.requiresReview) {
      reviewItems.push({
        eventId: event.id,
        message: `Missing reviewed EUR tax value for ${event.type} on ${event.date}.`,
      });
      continue;
    }

    if (event.type === "DIVIDEND" || event.type === "INTEREST") {
      const amount = decimal(event.amountEur ?? event.amount);
      if (!amount.isZero()) {
        capitalIncome = capitalIncome.plus(amount);
        evidence.push(toEvidence(event, "capitalIncome", amount));
      }

      const withholding = decimal(event.withholdingTaxEur ?? event.withholdingTax);
      if (!withholding.isZero()) {
        foreignWithholdingTax = foreignWithholdingTax.plus(withholding.abs());
      }

      continue;
    }

    if (event.type === "TRADE") {
      const result = decimal(event.realizedPnlEur ?? event.realizedPnl);
      if (result.gt(0)) {
        capitalIncome = capitalIncome.plus(result);
        evidence.push(toEvidence(event, "capitalIncome", result));
      } else if (result.lt(0)) {
        stockLosses = stockLosses.plus(result.abs());
        evidence.push(toEvidence(event, "stockLosses", result.abs()));
      }
      continue;
    }

    if (event.type === "WITHHOLDING_TAX") {
      const tax =
        event.withholdingTaxEur !== undefined
          ? decimal(event.withholdingTaxEur)
          : event.withholdingTax !== undefined
            ? decimal(event.withholdingTax)
            : decimal(event.amountEur ?? event.amount).abs();
      if (!tax.isZero()) {
        foreignWithholdingTax = foreignWithholdingTax.plus(tax.abs());
        evidence.push(toEvidence(event, "foreignWithholdingTax", tax.abs()));
      }
    }
  }

  return {
    taxYear,
    lines: {
      capitalIncome: moneyString(capitalIncome),
      stockLosses: moneyString(stockLosses),
      foreignWithholdingTax: moneyString(foreignWithholdingTax),
    },
    evidence,
    reviewItems,
    filingReady: reviewItems.length === 0,
  };
}

function toEvidence(
  event: NormalizedEvent,
  line: keyof GermanTaxDraftLines,
  amount: Decimal,
): GermanTaxEvidenceItem {
  return {
    eventId: event.id,
    date: event.date,
    broker: event.broker,
    accountNumber: event.accountNumber,
    type: event.type,
    currency: event.currency,
    amount: moneyString(amount),
    line,
    ...(event.symbol ? { symbol: event.symbol } : {}),
    ...(event.isin ? { isin: event.isin } : {}),
  };
}
