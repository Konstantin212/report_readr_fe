/**
 * Pure parsers for corporate-action descriptions.
 *
 * A ticker/symbol change (e.g. SK hynix ADR SKHYV → SKHY) keeps the position's
 * economic identity — same shares, same cost basis, usually the same ISIN.
 * The replay keys lots by ISIN, so a rename is only dangerous when the old
 * (when-issued) ticker's trades lack a stable ISIN: without a link the two
 * tickers split into two positions and FIFO breaks. `parseSymbolChange`
 * recovers that link from the broker's corporate-action row.
 */

export type SymbolChange = {
  fromSymbol: string;
  toSymbol: string;
  /** Destination ISIN — the identity the surviving position is keyed by. */
  isin?: string;
  /** Source ISIN — differs from `isin` on a CUSIP/ISIN change; needed to
   *  re-key the old leg's already-ISIN-stamped trades onto the survivor. */
  fromIsin?: string;
};

const CHANGE_RE = /\b(?:symbol|ticker|name|cusip(?:\s*\/\s*isin)?|isin)\s+change\b/i;
const ISIN = "[A-Z]{2}[A-Z0-9]{9}[0-9]";
const TICKER = "[A-Z][A-Z0-9.]{0,11}";
const FROM_RE = new RegExp(`^\\s*(${TICKER})(?:\\((${ISIN})\\))?`);
const TO_RE = new RegExp(`(?:\\bto\\b|→|->)\\s*(${TICKER})(?:\\((${ISIN})\\))?`);

/** Returns the rename link, or null if the description is not a symbol change. */
export function parseSymbolChange(description?: string | null): SymbolChange | null {
  if (!description || !CHANGE_RE.test(description)) return null;

  const from = FROM_RE.exec(description);
  const to = TO_RE.exec(description);
  if (!from || !to) return null;

  const fromSymbol = from[1];
  const toSymbol = to[1];
  if (!fromSymbol || !toSymbol || fromSymbol === toSymbol) return null;

  // Key the surviving position by the DESTINATION identity.
  const isin = to[2] ?? from[2] ?? undefined;
  const fromIsin = from[2] ?? undefined;
  return { fromSymbol, toSymbol, isin, fromIsin };
}
