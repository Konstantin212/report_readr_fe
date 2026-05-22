import Decimal from "decimal.js";
import type { NormalizedEvent } from "@/lib/domain/types";
import type { Lot, RealizedMatch } from "@/lib/ledger/replay";

/**
 * FIFO replay specifically for crypto events. Three differences from the
 * stock-broker replay in lib/ledger/replay.ts:
 *
 * - The crypto mapper strips the sign from qty, so we use eventType
 *   (CRYPTO_BUY vs CRYPTO_SELL) to determine direction rather than
 *   inferring from the sign.
 * - CRYPTO_STAKE_REWARD payouts open a new lot at the EUR fair value at
 *   receipt. Tax law (§22 Nr. 3 income + restart of §23 clock) treats
 *   each reward as both income AND a fresh acquisition.
 * - isLongTerm = holdingDays > 365 means "tax-free under §23 EStG"
 *   (private sale gain rule). For stocks, the same flag is informational.
 */
export function replayCrypto(events: NormalizedEvent[]): { lots: Lot[]; matches: RealizedMatch[] } {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const openLotsBySymbol = new Map<string, Lot[]>();
  const matches: RealizedMatch[] = [];

  for (const e of sorted) {
    if (!e.symbol) continue;
    const qty = new Decimal(e.quantity ?? "0");
    const amountEur = new Decimal(e.amountEur ?? "0");

    if (e.type === "CRYPTO_BUY" || e.type === "CRYPTO_STAKE_REWARD") {
      if (qty.lte(0)) continue;
      const list = openLotsBySymbol.get(e.symbol) ?? [];
      list.push({
        symbol: e.symbol,
        openedAt: e.date,
        remainingQty: qty.toString(),
        costEur: amountEur.toString(),
        sourceEventId: e.id,
      });
      openLotsBySymbol.set(e.symbol, list);
      continue;
    }

    if (e.type === "CRYPTO_SELL") {
      if (qty.lte(0)) continue;
      const list = openLotsBySymbol.get(e.symbol) ?? [];
      const totalSold = qty;
      let toClose = qty;
      const proceedsTotal = amountEur;

      while (toClose.gt(0) && list.length > 0) {
        const lot = list[0];
        const lotQty = new Decimal(lot.remainingQty);
        const consume = Decimal.min(lotQty, toClose);
        const costPortion = new Decimal(lot.costEur).mul(consume).div(lotQty);
        const proceedsPortion = proceedsTotal.mul(consume).div(totalSold);
        const gain = proceedsPortion.minus(costPortion);
        const days = daysBetween(lot.openedAt, e.date);
        matches.push({
          symbol: lot.symbol,
          openingEventId: lot.sourceEventId,
          closingEventId: e.id,
          qty: consume.toString(),
          costEur: costPortion.toFixed(2),
          proceedsEur: proceedsPortion.toFixed(2),
          gainEur: gain.toFixed(2),
          holdingDays: days,
          isLongTerm: days > 365,
          closedAt: e.date,
        });

        const remaining = lotQty.minus(consume);
        if (remaining.lte(0)) list.shift();
        else {
          lot.remainingQty = remaining.toString();
          lot.costEur = new Decimal(lot.costEur).minus(costPortion).toFixed(8);
        }
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
