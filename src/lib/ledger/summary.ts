import Decimal from "decimal.js";

import { decimal, moneyString } from "@/lib/domain/decimal";
import type { NormalizedEvent } from "@/lib/domain/types";

export type LedgerPosition = {
  symbol: string;
  quantity: string;
  currency: string;
  isin?: string;
};

export type LedgerSummary = {
  positions: LedgerPosition[];
  cashByCurrency: Record<string, string>;
  cashByCurrencyEur: string;
  realizedPnl: string;
  realizedPnlEur: string;
  income: string;
  incomeEur: string;
  fees: string;
  feesEur: string;
  reviewAlerts: LedgerReviewAlert[];
};

export type LedgerReviewAlert = {
  eventId: string;
  message: string;
};

type PositionAccumulator = {
  symbol: string;
  currency: string;
  isin?: string;
  quantity: Decimal;
};

export function buildLedgerSummary(events: NormalizedEvent[]): LedgerSummary {
  const positions = new Map<string, PositionAccumulator>();
  const cashByCurrency = new Map<string, Decimal>();
  let cashByCurrencyEur = new Decimal(0);
  let realizedPnl = new Decimal(0);
  let realizedPnlEur = new Decimal(0);
  let income = new Decimal(0);
  let incomeEur = new Decimal(0);
  let fees = new Decimal(0);
  let feesEur = new Decimal(0);
  const reviewAlerts: LedgerReviewAlert[] = [];

  for (const event of [...events].sort(compareEventsChronologically)) {
    if (event.type === "TRADE") {
      applyTradePosition(positions, event, reviewAlerts);
      cashByCurrencyEur = cashByCurrencyEur.plus(applyEventCash(cashByCurrency, event));
      realizedPnl = realizedPnl.plus(decimal(event.realizedPnl));
      realizedPnlEur = realizedPnlEur.plus(decimal(event.realizedPnlEur));
      fees = fees.plus(decimal(event.fee));
      feesEur = feesEur.plus(decimal(event.feeEur));
      continue;
    }

    if (event.type === "POSITION_SNAPSHOT") {
      applyPositionSnapshotEvidence(positions, event, reviewAlerts);
      continue;
    }

    if (event.type === "DIVIDEND" || event.type === "INTEREST") {
      income = income.plus(decimal(event.amount));
      incomeEur = incomeEur.plus(decimal(event.amountEur));
      cashByCurrencyEur = cashByCurrencyEur.plus(applyEventCash(cashByCurrency, event));
      continue;
    }

    if (event.type === "FEE") {
      const fee = event.fee !== undefined ? decimal(event.fee) : decimal(event.amount).abs();
      fees = fees.plus(fee);
      feesEur = feesEur.plus(decimal(event.feeEur ?? event.amountEur));
      cashByCurrencyEur = cashByCurrencyEur.plus(applyEventCash(cashByCurrency, event));
      continue;
    }

    if (event.type === "WITHHOLDING_TAX") {
      cashByCurrencyEur = cashByCurrencyEur.plus(applyEventCash(cashByCurrency, event));
      continue;
    }

    cashByCurrencyEur = cashByCurrencyEur.plus(applyEventCash(cashByCurrency, event));
  }

  return {
    positions: Array.from(positions.values())
      .filter((position) => !position.quantity.isZero())
      .sort((left, right) => left.symbol.localeCompare(right.symbol))
      .map((position) => ({
        symbol: position.symbol,
        quantity: moneyString(position.quantity),
        currency: position.currency,
        ...(position.isin ? { isin: position.isin } : {}),
      })),
    cashByCurrency: Object.fromEntries(
      Array.from(cashByCurrency.entries())
        .filter(([, amount]) => !amount.isZero())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([currency, amount]) => [currency, moneyString(amount)]),
    ),
    cashByCurrencyEur: moneyString(cashByCurrencyEur),
    realizedPnl: moneyString(realizedPnl),
    realizedPnlEur: moneyString(realizedPnlEur),
    income: moneyString(income),
    incomeEur: moneyString(incomeEur),
    fees: moneyString(fees),
    feesEur: moneyString(feesEur),
    reviewAlerts,
  };
}

function applyTradePosition(
  positions: Map<string, PositionAccumulator>,
  event: NormalizedEvent,
  reviewAlerts: LedgerReviewAlert[],
): void {
  if (!event.symbol || event.quantity === undefined) {
    return;
  }

  const key = positionKey(event.symbol, event.currency, event.isin);
  const current =
    positions.get(key) ??
    ({
      symbol: event.symbol,
      currency: event.currency,
      isin: event.isin,
      quantity: new Decimal(0),
    } satisfies PositionAccumulator);

  current.quantity = current.quantity.plus(decimal(event.quantity));
  if (current.quantity.lt(0)) {
    reviewAlerts.push({
      eventId: event.id,
      message: `Position for ${event.symbol} becomes negative after this event.`,
    });
  }
  positions.set(key, current);
}

function applyPositionSnapshotEvidence(
  positions: Map<string, PositionAccumulator>,
  event: NormalizedEvent,
  reviewAlerts: LedgerReviewAlert[],
): void {
  if (!event.symbol || event.quantity === undefined) {
    return;
  }

  const current = positions.get(positionKey(event.symbol, event.currency, event.isin));
  if (!current || current.quantity.eq(decimal(event.quantity))) {
    return;
  }

  reviewAlerts.push({
    eventId: event.id,
    message: `Position snapshot for ${event.symbol} reports ${moneyString(decimal(event.quantity))} while the event ledger calculates ${moneyString(current.quantity)}.`,
  });
}

function applyEventCash(cashByCurrency: Map<string, Decimal>, event: NormalizedEvent): Decimal {
  if (event.cashAmount !== undefined) {
    addCash(cashByCurrency, event.currency, decimal(event.cashAmount));
    return decimal(event.cashAmountEur);
  }

  if (event.type === "TRADE") {
    applyTradeCash(cashByCurrency, event);
    return decimal(event.cashAmountEur);
  }

  if (event.type === "DIVIDEND" || event.type === "INTEREST") {
    addCash(cashByCurrency, event.currency, decimal(event.amount).minus(decimal(event.withholdingTax)));
    return decimal(event.cashAmountEur);
  }

  if (event.type === "FEE") {
    const fee = event.fee !== undefined ? decimal(event.fee) : decimal(event.amount).abs();
    addCash(cashByCurrency, event.currency, event.amount !== undefined ? decimal(event.amount) : fee.negated());
    return decimal(event.cashAmountEur);
  }

  if (event.type === "WITHHOLDING_TAX") {
    const tax = event.withholdingTax !== undefined ? decimal(event.withholdingTax) : decimal(event.amount).abs();
    addCash(cashByCurrency, event.currency, event.amount !== undefined ? decimal(event.amount) : tax.negated());
    return decimal(event.cashAmountEur);
  }

  if (event.amount !== undefined) {
    addCash(cashByCurrency, event.currency, decimal(event.amount));
  }
  return decimal(event.cashAmountEur);
}

function applyTradeCash(cashByCurrency: Map<string, Decimal>, event: NormalizedEvent): void {
  if (event.amount !== undefined) {
    addCash(cashByCurrency, event.currency, decimal(event.amount).minus(decimal(event.fee)));
    return;
  }

  if (event.proceeds !== undefined) {
    addCash(cashByCurrency, event.currency, decimal(event.proceeds));
  }
}

function addCash(cashByCurrency: Map<string, Decimal>, currency: string, amount: Decimal): void {
  cashByCurrency.set(currency, (cashByCurrency.get(currency) ?? new Decimal(0)).plus(amount));
}

function positionKey(symbol: string, currency: string, isin?: string): string {
  return [symbol, currency, isin ?? ""].join("|");
}

function compareEventsChronologically(left: NormalizedEvent, right: NormalizedEvent): number {
  const dateComparison = left.date.localeCompare(right.date);
  return dateComparison === 0 ? left.id.localeCompare(right.id) : dateComparison;
}
