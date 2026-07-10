/**
 * Resolves the current display/quote ticker for each ISIN from a statement's
 * events. See tests/imports/instrument-symbols.test.ts for the rationale — the
 * short version is that a rename (SKHYV → SKHY) must resolve to the surviving
 * tradeable ticker, never the delisted one.
 */
import { parseSymbolChange } from "@/lib/ledger/corporate-actions";

type SymbolEvent = {
  isin?: string | null;
  symbol?: string | null;
  date: string;
  type: string;
  description?: string | null;
};

export function resolveInstrumentSymbols(events: SymbolEvent[]): Map<string, string> {
  // A SYMBOL_CHANGE destination is authoritative for its ISIN.
  const renamed = new Map<string, string>();
  for (const e of events) {
    if (e.type !== "CORPORATE_ACTION") continue;
    const sc = parseSymbolChange(e.description);
    const isin = sc?.isin ?? e.isin ?? undefined;
    if (sc && isin) renamed.set(isin, sc.toSymbol);
  }

  // Otherwise the newest-dated event's symbol wins.
  const newest = new Map<string, { date: string; symbol: string }>();
  for (const e of events) {
    if (!e.isin || !e.symbol) continue;
    const prev = newest.get(e.isin);
    if (!prev || e.date >= prev.date) newest.set(e.isin, { date: e.date, symbol: e.symbol });
  }

  const out = new Map<string, string>();
  for (const [isin, { symbol }] of newest) out.set(isin, renamed.get(isin) ?? symbol);
  for (const [isin, symbol] of renamed) if (!out.has(isin)) out.set(isin, symbol);
  return out;
}
