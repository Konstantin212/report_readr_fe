import Decimal from "decimal.js";
import type { NormalizedEvent } from "@/lib/domain/types";

export type Lot = {
  symbol: string;
  isin?: string;
  openedAt: string;
  remainingQty: string;
  costEur: string;
  sourceEventId: string;
};

export type RealizedMatch = {
  symbol: string;
  isin?: string;
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

const identityOf = (e: NormalizedEvent): string => e.isin ?? e.symbol ?? "";

/**
 * Returns -1 for a buy (qty > 0), +1 for a sell (qty < 0), 0 otherwise.
 * Used as a tiebreaker so same-day TRADE events sort buys-before-sells:
 * you can't sell what you haven't bought, and intraday FIFO should match
 * a buy against a same-day sell rather than leaking a phantom open lot.
 *
 * Why this matters: when replay runs against DB-stored transactions
 * (runReplayForAccount in ingest.ts), the original parser-emitted ID is
 * replaced by a random DB UUID. Without the qty-sign tiebreaker, two
 * same-day trades sort by UUID — randomly — and roughly half the time
 * the sell lands before the buy, opening a 1-share zombie lot.
 */
function tradeSideOrder(e: NormalizedEvent): number {
  if (e.type !== "TRADE") return 0;
  const q = Number(e.quantity ?? "0");
  if (!Number.isFinite(q)) return 0;
  if (q > 0) return -1;
  if (q < 0) return 1;
  return 0;
}

export function replay(events: NormalizedEvent[]): { lots: Lot[]; matches: RealizedMatch[] } {
  const sorted = [...events].sort((a, b) =>
    a.date.localeCompare(b.date)
    || (TYPE_ORDER[a.type] - TYPE_ORDER[b.type])
    || (tradeSideOrder(a) - tradeSideOrder(b))
    || a.id.localeCompare(b.id),
  );

  const openLotsByIdentity = new Map<string, Lot[]>();
  const matches: RealizedMatch[] = [];

  // Freedom Finance reports a share split as a PAIR of CORPORATE_ACTION rows
  // on the same date+identity: a negative quantity (old shares removed) and a
  // positive quantity (new shares added), e.g. -34 / +102 for a 3:1 split.
  // We buffer the first leg per identity and apply the ratio once both arrive
  // (the two rows may sort in either order). A split preserves cost basis, so
  // we scale each open lot's remaining quantity and leave its cost untouched —
  // per-share cost implicitly divides by the ratio. Without this, a later sell
  // would FIFO-match pre-split lots at the un-split per-share cost, inventing a
  // phantom realized loss.
  const pendingSplits = new Map<string, { remove?: Decimal; add?: Decimal }>();

  for (const e of sorted) {
    if (e.type === "CORPORATE_ACTION" && /split/i.test(e.description ?? "")) {
      const q = Number(e.quantity);
      if (!Number.isFinite(q) || q === 0) continue;
      const id = identityOf(e);
      if (!id) continue;
      const legQty = new Decimal(e.quantity ?? "0");
      const pending = pendingSplits.get(id) ?? {};
      if (legQty.lt(0)) pending.remove = legQty.abs();
      else pending.add = legQty;
      pendingSplits.set(id, pending);

      if (pending.remove && pending.add && pending.remove.gt(0)) {
        const ratio = pending.add.div(pending.remove);
        if (ratio.isFinite() && ratio.gt(0)) {
          // Identity fallback: FF corporate-action rows often carry only the
          // symbol while TRADE lots are keyed by ISIN (identityOf = isin ??
          // symbol). Try the event's own identity, then the other key, then
          // scan for a lot list whose lots carry this symbol — otherwise the
          // split silently applies to a nonexistent identity and the phantom
          // pre-split basis survives (the exact SCHD production bug).
          const lots =
            openLotsByIdentity.get(id)
            ?? (e.symbol ? openLotsByIdentity.get(e.symbol) : undefined)
            ?? (e.symbol
              ? [...openLotsByIdentity.values()].find((l) => l[0]?.symbol === e.symbol)
              : undefined);
          if (lots) {
            // Scale FIFO only up to the REMOVE quantity the broker declared —
            // not every open lot. A same-day post-split buy sorts BEFORE the
            // corporate action (TYPE_ORDER puts TRADE first) and must not be
            // scaled: the -34/+102 pair applies to exactly 34 pre-split
            // shares. Multiply-then-divide keeps exact ratios (102/34) exact.
            let toScale = pending.remove;
            for (const lot of lots) {
              if (toScale.lte(0)) break;
              const lotQty = new Decimal(lot.remainingQty);
              const consume = Decimal.min(lotQty, toScale);
              const scaled = consume.mul(pending.add).div(pending.remove);
              lot.remainingQty = scaled.plus(lotQty.minus(consume)).toString();
              toScale = toScale.minus(consume);
            }
          }
        }
        pendingSplits.delete(id);
      }
      continue;
    }

    if (e.type !== "TRADE" || !e.symbol) continue;
    const id = identityOf(e);
    if (!id) continue;
    const qty = new Decimal(e.quantity ?? "0");
    const amount = new Decimal(e.amountEur ?? e.amount ?? "0").abs();
    const fee = new Decimal(e.feeEur ?? e.fee ?? "0");
    const list = openLotsByIdentity.get(id) ?? [];

    if (qty.gt(0)) {
      list.push({
        symbol: e.symbol,
        isin: e.isin,
        openedAt: e.date,
        remainingQty: qty.toString(),
        costEur: amount.plus(fee).toString(),
        sourceEventId: e.id,
      });
      openLotsByIdentity.set(id, list);
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
          symbol: lot.symbol,
          isin: lot.isin,
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

  const lots = [...openLotsByIdentity.values()].flat();
  return { lots, matches };
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}
