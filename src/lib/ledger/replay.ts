import Decimal from "decimal.js";
import type { NormalizedEvent } from "@/lib/domain/types";
import { parseSymbolChange } from "./corporate-actions";

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

  // Ticker rename (SKHYV → SKHY) alias, built from SYMBOL_CHANGE corporate
  // actions before any trade is keyed. A when-issued leg often lacks a stable
  // ISIN; without this link its lots key by the old symbol and split off into
  // a separate position, breaking FIFO. The alias folds the old symbol onto
  // the surviving identity (destination ISIN, else destination symbol).
  // Two lookups: by old symbol (when-issued leg with no ISIN) and by old ISIN
  // (CUSIP/ISIN change — the old leg's trades carry a *different* ISIN and
  // would otherwise never link to the survivor). Both resolve to the surviving
  // identity: destination ISIN if known, else destination symbol.
  const aliasBySymbol = new Map<string, string>();
  const aliasByIsin = new Map<string, string>();
  for (const e of events) {
    if (e.type !== "CORPORATE_ACTION") continue;
    const sc = parseSymbolChange(e.description);
    if (!sc) continue;
    const survivor = sc.isin ?? e.isin ?? sc.toSymbol;
    aliasBySymbol.set(sc.fromSymbol, survivor);
    const fromIsin = sc.fromIsin ?? undefined;
    if (fromIsin && fromIsin !== survivor) aliasByIsin.set(fromIsin, survivor);
  }
  const resolveIdentity = (e: NormalizedEvent): string => {
    if (e.isin) return aliasByIsin.get(e.isin) ?? e.isin;
    if (e.symbol) {
      const survivor = aliasBySymbol.get(e.symbol);
      if (survivor) return survivor;
    }
    return e.symbol ?? "";
  };

  // Share splits arrive in two broker-specific shapes:
  //
  //  - Freedom Finance: a PAIR of CORPORATE_ACTION rows on the same
  //    date+identity — negative qty (old shares removed) and positive qty
  //    (new shares added), e.g. -34 / +102 for a 3:1 split, description
  //    just "split". We buffer the first leg and apply once both arrive.
  //  - IBKR: a SINGLE row whose description carries the ratio, e.g.
  //    "SCHD(US8085247976) Split 3 for 1 (…)", with Quantity = the NET
  //    share delta (+68 for 34→102). We parse "X for Y" and derive the
  //    affected pre-split quantity from the delta.
  //
  // A split preserves cost basis: we scale lot quantities FIFO up to the
  // affected pre-split quantity and leave costEur untouched (per-share cost
  // implicitly divides by the ratio). Without this, a later sell would
  // FIFO-match pre-split lots at the un-split per-share cost, inventing a
  // phantom realized loss (the SCHD −€1,531 production bug).
  const pendingSplits = new Map<string, { remove?: Decimal; add?: Decimal }>();

  // Idempotency: the same physical split can appear MORE THAN ONCE in the
  // event stream — FF exports it in several arrays, and re-uploading
  // overlapping statements can insert content-variant duplicates (e.g. the
  // same -34/+102 pair with and without ISIN after a parser enrichment
  // changed the dedup fingerprint). Applying a split twice compounds the
  // ratio and manufactures phantom shares (a real 68-share SCHD zombie in
  // production). One (identity, date, signedQty | ratio-text) split leg is
  // therefore processed at most once.
  const seenSplitLegs = new Set<string>();

  // Identity fallback: corporate-action rows often carry only the symbol
  // while TRADE lots are keyed by ISIN (identityOf = isin ?? symbol). Try
  // the event's own identity, then the other key, then scan for a lot list
  // whose lots carry this symbol — otherwise the split silently applies to
  // a nonexistent identity and the phantom pre-split basis survives.
  const resolveLots = (e: NormalizedEvent, id: string): Lot[] | undefined =>
    openLotsByIdentity.get(id)
    ?? (e.symbol ? openLotsByIdentity.get(e.symbol) : undefined)
    ?? (e.symbol
      ? [...openLotsByIdentity.values()].find((l) => l[0]?.symbol === e.symbol)
      : undefined);

  // Scale FIFO only up to the affected pre-split quantity — not every open
  // lot. A same-day post-split buy sorts BEFORE the corporate action
  // (TYPE_ORDER puts TRADE first) and must not be scaled. Multiply-then-
  // divide keeps exact ratios (102/34) exact.
  const scaleFifo = (lots: Lot[], removeQty: Decimal, addQty: Decimal): void => {
    let toScale = removeQty;
    for (const lot of lots) {
      if (toScale.lte(0)) break;
      const lotQty = new Decimal(lot.remainingQty);
      const consume = Decimal.min(lotQty, toScale);
      const scaled = consume.mul(addQty).div(removeQty);
      lot.remainingQty = scaled.plus(lotQty.minus(consume)).toString();
      toScale = toScale.minus(consume);
    }
  };

  for (const e of sorted) {
    if (e.type === "CORPORATE_ACTION" && /split/i.test(e.description ?? "")) {
      const id = resolveIdentity(e);
      if (!id) continue;

      // Key by the split's OBSERVABLE identity (symbol-normalized id would
      // differ between an isin-carrying and isin-less duplicate, so use the
      // symbol too), the date, and the leg quantity / ratio text.
      const legKey = `${e.symbol ?? id}|${e.date}|${e.quantity ?? ""}|${(e.description ?? "").toLowerCase()}`;
      if (seenSplitLegs.has(legKey)) continue;
      seenSplitLegs.add(legKey);

      // IBKR single-row form: ratio in the description ("Split 3 for 1",
      // reverse: "Split 1 for 10").
      const ratioMatch = /(\d+(?:\.\d+)?)\s*for\s*(\d+(?:\.\d+)?)/i.exec(e.description ?? "");
      if (ratioMatch) {
        const newPer = new Decimal(ratioMatch[1]);
        const oldPer = new Decimal(ratioMatch[2]);
        if (newPer.lte(0) || oldPer.lte(0) || newPer.eq(oldPer)) continue;
        const lots = resolveLots(e, id);
        if (!lots) continue;
        const ratio = newPer.div(oldPer);
        const delta = new Decimal(e.quantity ?? "0");
        if (!delta.isZero() && delta.isFinite()) {
          // delta = old × (ratio − 1) ⇒ old = |delta| / |ratio − 1|.
          const oldQty = delta.abs().div(ratio.minus(1).abs());
          scaleFifo(lots, oldQty, oldQty.mul(ratio));
        } else {
          // No usable delta — scale the whole open position (splits are
          // dated distinctly from trades in IBKR statements, so the
          // same-day-buy hazard of the FF pair form doesn't apply here).
          const total = lots.reduce((s, l) => s.plus(l.remainingQty), new Decimal(0));
          if (total.gt(0)) scaleFifo(lots, total, total.mul(ratio));
        }
        continue;
      }

      // FF pair form: buffer legs per identity until both signs arrived.
      const q = Number(e.quantity);
      if (!Number.isFinite(q) || q === 0) continue;
      const legQty = new Decimal(e.quantity ?? "0");
      const pending = pendingSplits.get(id) ?? {};
      if (legQty.lt(0)) pending.remove = legQty.abs();
      else pending.add = legQty;
      pendingSplits.set(id, pending);

      if (pending.remove && pending.add && pending.remove.gt(0)) {
        const ratio = pending.add.div(pending.remove);
        if (ratio.isFinite() && ratio.gt(0)) {
          const lots = resolveLots(e, id);
          if (lots) scaleFifo(lots, pending.remove, pending.add);
        }
        pendingSplits.delete(id);
      }
      continue;
    }

    if (e.type !== "TRADE" || !e.symbol) continue;
    const id = resolveIdentity(e);
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
