/**
 * Distinct former ticker symbols of a (possibly renamed) position: the lot
 * symbols that differ from the current display symbol, deduped and in
 * first-seen order. Empty when the position was never renamed.
 */
export function formerTickers(lotSymbols: string[], displaySymbol: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const sym of lotSymbols) {
    if (!sym || sym === displaySymbol || seen.has(sym)) continue;
    seen.add(sym);
    out.push(sym);
  }
  return out;
}
