import Decimal from "decimal.js";
import type { NormalizedEvent } from "@/lib/domain/types";

export type Lot = {
  symbol: string;
  openedAt: string;
  remainingQty: string;
  costEur: string;
  sourceEventId: string;
};

export type RealizedMatch = {
  symbol: string;
  openingEventId: string;
  closingEventId: string;
  qty: string;
  costEur: string;
  proceedsEur: string;
  gainEur: string;
  holdingDays: number;
  isLongTerm: boolean;
  closedAt: string;
};

const TYPE_ORDER: Record<string, number> = {
  TRADE: 0, CORPORATE_ACTION: 1, DIVIDEND: 2, INTEREST: 3,
  WITHHOLDING_TAX: 4, FEE: 5, CASH_TRANSFER: 6, POSITION_SNAPSHOT: 7, FX_CONVERSION: 8,
};

export function replay(events: NormalizedEvent[]): { lots: Lot[]; matches: RealizedMatch[] } {
  const sorted = [...events].sort((a, b) =>
    a.date.localeCompare(b.date) || (TYPE_ORDER[a.type] - TYPE_ORDER[b.type]) || a.id.localeCompare(b.id),
  );

  const openLotsBySymbol = new Map<string, Lot[]>();
  const matches: RealizedMatch[] = [];

  for (const e of sorted) {
    if (e.type !== "TRADE" || !e.symbol) continue;
    const qty = new Decimal(e.quantity ?? "0");
    const amount = new Decimal(e.amountEur ?? e.amount ?? "0").abs();
    const fee = new Decimal(e.feeEur ?? e.fee ?? "0");
    const list = openLotsBySymbol.get(e.symbol) ?? [];

    if (qty.gt(0)) {
      list.push({
        symbol: e.symbol,
        openedAt: e.date,
        remainingQty: qty.toString(),
        costEur: amount.plus(fee).toString(),
        sourceEventId: e.id,
      });
      openLotsBySymbol.set(e.symbol, list);
    } else if (qty.lt(0)) {
      let toClose = qty.abs();
      const totalSold = qty.abs();
      const proceedsTotal = amount.minus(fee);

      while (toClose.gt(0) && list.length > 0) {
        const lot = list[0];
        const lotQty = new Decimal(lot.remainingQty);
        const consume = Decimal.min(lotQty, toClose);
        const costPortion = new Decimal(lot.costEur).mul(consume).div(lotQty);
        const proceedsPortion = proceedsTotal.mul(consume).div(totalSold);
        const gain = proceedsPortion.minus(costPortion);
        const closedAt = e.date;
        const days = daysBetween(lot.openedAt, closedAt);
        matches.push({
          symbol: e.symbol,
          openingEventId: lot.sourceEventId,
          closingEventId: e.id,
          qty: consume.toString(),
          costEur: costPortion.toFixed(2),
          proceedsEur: proceedsPortion.toFixed(2),
          gainEur: gain.toFixed(2),
          holdingDays: days,
          isLongTerm: days >= 365,
          closedAt,
        });
        const remaining = lotQty.minus(consume);
        if (remaining.lte(0)) list.shift();
        else { lot.remainingQty = remaining.toString(); lot.costEur = new Decimal(lot.costEur).minus(costPortion).toFixed(2); }
        toClose = toClose.minus(consume);
      }
    }
  }

  const lots = [...openLotsBySymbol.values()].flat();
  return { lots, matches };
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}
