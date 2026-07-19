/**
 * Pure assembly of the Anlage KAP builder input from already-loaded rows,
 * plus the classification, Vorabpauschale, and corporate-action guard logic
 * that used to live inside the DB loader (`data/tax.ts`). No I/O here — every
 * function takes plain rows and returns plain data, so the German-tax logic
 * is unit-testable in isolation beside `german-tax.ts`.
 */
import type { userSettings, transactions, realizedMatches, brokerAccounts } from "@/lib/db/schema";
import type { BuildAnlageKapInput, GermanTaxDraft } from "@/lib/tax/german-tax";
import type { AssetKind, FundSubtype } from "@/lib/analytics/sector-map";
import type { ClassificationOverride } from "@/lib/analytics/classification";
import { SAVER_ALLOWANCE_DEFAULT } from "@/lib/tax/constants";

/** {kind, subtype} record passed to the pure KAP builder (T-wire), keyed by
 *  BOTH symbol and ISIN (the two key spaces can't collide — ISINs are 12-char
 *  country-prefixed codes). Built from the instrument_meta enrichment
 *  overrides plus the broker-declared `instruments.kind`, so US-ETF and other
 *  reclassifications flow into the tax draft without the builder doing I/O.
 *
 *  ISIN keys matter because ticker symbols collide: the user's portfolio has
 *  Citigroup common stock (US1729674242, FF) and a Citigroup bond
 *  (US172967MZ11, IBKR) BOTH under symbol "C" — only the ISIN separates
 *  Aktien losses (Z23) from sonstige losses (Z22). */
export type ClassificationRecord = Record<
  string,
  { kind: AssetKind; subtype: FundSubtype | null; accumulating?: boolean }
>;

const VALID_KINDS: ReadonlySet<string> = new Set(["stock", "etf", "bond", "other"]);

export function toClassificationRecord(
  overrides: Map<string, ClassificationOverride>,
  instrumentRows: Array<{ symbol: string | null; isin: string | null; kind: string | null }> = [],
): ClassificationRecord {
  const out: ClassificationRecord = {};
  for (const [symbol, o] of overrides)
    out[symbol] = {
      kind: o.kind,
      subtype: o.subtype,
      // justETF-scraped distribution policy — drives the Vorabpauschale
      // guard (§18 InvStG): accumulating funds owe tax on a fictitious
      // yield that foreign broker statements never show.
      accumulating: o.distribution?.policy === "ACCUMULATING" || undefined,
    };
  for (const row of instrumentRows) {
    if (!row.isin || out[row.isin]) continue;
    const symbolEntry = row.symbol ? out[row.symbol] : undefined;
    const rowKind = row.kind && VALID_KINDS.has(row.kind) ? (row.kind as AssetKind) : undefined;
    // Per-ISIN precedence: a rich (meta-derived, subtype-carrying) symbol
    // entry wins; otherwise the broker-declared kind for THIS ISIN beats a
    // possibly-colliding symbol entry from a different listing.
    if (symbolEntry && (symbolEntry.subtype !== null || !rowKind)) {
      out[row.isin] = symbolEntry;
    } else if (rowKind) {
      out[row.isin] = { kind: rowKind, subtype: null };
    }
  }
  return out;
}

/**
 * Returns true for transaction sources that look like dividend-accrual
 * artefacts. Used to exclude those rows from the dividend totals — only
 * actually-paid dividends count under §20 EStG (Zuflussprinzip).
 *
 * Exported so tests can lock in the matching contract.
 */
export function isAccrualSource(source: string | null | undefined): boolean {
  if (!source) return false;
  return /accrual/i.test(source);
}

/**
 * Returns true for INTEREST rows that are non-deductible financing costs
 * rather than capital income — margin "Debit Interest" (Sollzinsen).
 *
 * §20 Abs. 9 EStG allows no deduction of actual Werbungskosten beyond the
 * Sparer-Pauschbetrag, so debit interest must not be netted against received
 * interest. Brokers report both in the same statement section, which is how
 * €0.87 of IBKR margin interest silently reduced the 2025 interest total
 * from €33.30 to €32.43.
 *
 * Deliberately NOT a "drop all negatives" rule: accrued interest paid when
 * buying a bond (Stückzinsen) is also negative but IS negative capital
 * income under §20 Abs. 1 Nr. 7 and must survive this filter.
 */
export function isNonDeductibleInterest(description: string | null | undefined): boolean {
  if (!description) return false;
  return /\bdebit\s+interest\b/i.test(description);
}

export function isinToSymbolMap(
  rows: Array<{ symbol: string | null; isin: string | null }>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) if (r.isin && r.symbol && !out.has(r.isin)) out.set(r.isin, r.symbol);
  return out;
}

/**
 * Anlage KAP is §20 EStG (capital income from securities). Crypto sale gains
 * are §23 EStG (Anlage SO), so COINBASE accounts are excluded from the KAP
 * account scope (T2a). Returns the non-crypto account id set plus a display
 * broker label per account for the reconciliation subtotals (T5).
 */
export function deriveAccountScope(
  accountRows: Array<typeof brokerAccounts.$inferSelect>,
): { stockAccountIds: Set<string>; brokerById: Map<string, string> } {
  const nonCrypto = accountRows.filter(a => a.broker !== "COINBASE");
  return {
    stockAccountIds: new Set(nonCrypto.map(a => a.id)),
    brokerById: new Map(
      nonCrypto.map(a => [a.id, a.broker === "FREEDOM_FINANCE" ? "FF" : "IBKR"]),
    ),
  };
}

/**
 * Pure assembly of the BuildAnlageKapInput from already-loaded rows.
 * `getTaxData` reuses this to avoid re-querying transactions / matches /
 * settings a second time on every Tax page render — those three tables
 * are already in memory by the time we compute the KAP draft.
 */
export function buildKapInputs(
  taxYear: number,
  settings: typeof userSettings.$inferSelect | undefined,
  tx: Array<typeof transactions.$inferSelect>,
  allMatches: Array<typeof realizedMatches.$inferSelect>,
  stockAccountIds: Set<string>,
  brokerById: Map<string, string>,
  classification: ClassificationRecord,
  isinToSymbol: Map<string, string> = new Map(),
): BuildAnlageKapInput {
  const yr = String(taxYear);
  // T2a account scope: only non-crypto (stock) accounts feed Anlage KAP.
  // Crypto (COINBASE) realised gains / staking belong on Anlage SO (§23/§22),
  // so a match or dividend on a crypto account must never move a KAP line.
  const inScope = (accountId: string | null): boolean =>
    !!accountId && stockAccountIds.has(accountId);
  const brokerFor = (accountId: string | null): string | undefined =>
    accountId ? brokerById.get(accountId) : undefined;
  // Legacy IBKR ingests stored dividend/WHT rows without a symbol (only the
  // description carried "SYM(ISIN)"). Resolve a display ticker through the
  // user's instruments bridge so classification and evidence aren't blank.
  const resolveTicker = (symbol: string | null, isin: string | null): string =>
    symbol ?? (isin ? isinToSymbol.get(isin) : undefined) ?? "";

  // Defensive accruals filter (Zuflussprinzip): only PAID dividends count
  // for §20 EStG. The IBKR parser doesn't emit accruals as DIVIDEND events
  // today, but a previous upload of the GF's portfolio surfaced €12.33 of
  // mystery delta that exactly matched her year-end accrual balance — we
  // never reproduced the leak in code, but excluding sources that look
  // like accruals is cheap insurance against statement-variant edge cases.
  const dividends = tx
    .filter(t =>
      t.eventType === "DIVIDEND"
      && t.eventDate.startsWith(yr)
      && inScope(t.brokerAccountId)
      && !isAccrualSource(t.source ?? null)
    )
    .map(t => ({
      ticker: resolveTicker(t.symbol, t.isin),
      isin: t.isin ?? undefined,
      country: countryFromIsin(t.isin),
      grossEur: t.amountEur ?? "0",
      whtEur: t.withholdingTaxEur ?? "0",
      broker: brokerFor(t.brokerAccountId),
    }));
  const interest = tx
    .filter(t =>
      t.eventType === "INTEREST"
      && t.eventDate.startsWith(yr)
      && inScope(t.brokerAccountId)
      && !isNonDeductibleInterest(t.description ?? null)
    )
    .map(t => ({
      grossEur: t.amountEur ?? "0",
      broker: brokerFor(t.brokerAccountId),
      description: t.description ?? undefined,
    }));
  // Standalone withholding tax (T4): brokers that report WHT in a dedicated
  // section (IBKR) rather than inline on the dividend. The withheld amount
  // lands in withholdingTaxEur; fall back to amountEur for parsers that stow
  // it there.
  const withholding = tx
    .filter(t => t.eventType === "WITHHOLDING_TAX" && t.eventDate.startsWith(yr) && inScope(t.brokerAccountId))
    .map(t => ({
      symbol: resolveTicker(t.symbol, t.isin),
      isin: t.isin ?? undefined,
      whtEur: t.withholdingTaxEur ?? t.amountEur ?? "0",
      country: countryFromIsin(t.isin),
      broker: brokerFor(t.brokerAccountId),
    }));
  const matches = allMatches
    .filter(m => m.closedAt.startsWith(yr) && inScope(m.brokerAccountId))
    .map(m => ({
      symbol: m.symbol,
      isin: m.isin ?? undefined,
      gainEur: m.gainEur,
      closedAt: m.closedAt,
      broker: brokerFor(m.brokerAccountId),
      qty: m.qty ?? undefined,
      costEur: m.costEur ?? undefined,
      proceedsEur: m.proceedsEur ?? undefined,
    }));

  // Vorabpauschale guard (§18/§19 InvStG). Foreign brokers neither report
  // nor withhold the Vorabpauschale, so an accumulating fund makes the raw
  // statement silently incomplete. Detect two exposures and let the builder
  // attach loud warnings (the draft must never look "done" while missing
  // taxable income):
  //  - held at Dec-31 of (taxYear−1): its Vorabpauschale for (taxYear−1) is
  //    deemed received on the first working day of taxYear → belongs in
  //    THIS report;
  //  - sold during taxYear: the FIFO gain must be reduced by previously
  //    taxed Vorabpauschalen (§19) — we show the unreduced gain.
  // NB: this is a field-level OR (accumulating on EITHER key), not the
  // ISIN-first entry precedence of resolveClassification() — an accumulating
  // fund whose ISIN entry lost its distribution data (null subtype + a
  // broker-declared kind) must still be caught via its symbol entry. Do not
  // "simplify" this into resolveClassification: that would drop the guard.
  const isAccumulating = (symbol: string | null, isin: string | null): boolean =>
    Boolean((isin && classification[isin]?.accumulating) || (symbol && classification[symbol]?.accumulating));
  const priorYearEnd = `${taxYear - 1}-12-31`;
  const accNetQty = new Map<string, { symbol: string; qty: number }>();
  for (const t of tx) {
    if (t.eventType !== "TRADE" || !inScope(t.brokerAccountId)) continue;
    if (t.eventDate > priorYearEnd) continue;
    if (!isAccumulating(t.symbol, t.isin)) continue;
    const id = t.isin ?? t.symbol;
    if (!id) continue;
    const cur = accNetQty.get(id) ?? { symbol: t.symbol ?? id, qty: 0 };
    cur.qty += Number(t.quantity ?? 0);
    accNetQty.set(id, cur);
  }
  const heldAtPriorYearEnd = [...accNetQty.values()].filter(v => v.qty > 1e-9).map(v => v.symbol);
  const soldInYear = [...new Set(
    matches.filter(m => isAccumulating(m.symbol, m.isin ?? null)).map(m => m.symbol),
  )];
  const accumulatingFunds =
    heldAtPriorYearEnd.length || soldInYear.length
      ? { heldAtPriorYearEnd, soldInYear }
      : undefined;

  // Corporate-action prevention guards. The FIFO replay models share splits
  // (FF pair rows + IBKR "X for Y" rows) but nothing else — a merger,
  // spin-off, symbol change or an unrecognized split form would silently
  // corrupt the basis of every later sale. Detect three report-relevant
  // conditions and surface loud warnings instead of silent numbers:
  //  1. non-dividend, non-split corporate actions on identities with
  //     realised matches in the tax year;
  //  2. split rows in a shape the replay can NOT apply (no "X for Y" text
  //     and no complete −old/+new pair);
  //  3. sells whose quantity is not fully covered by matched lots (missing
  //     history or an unmodeled corporate action ate the basis).
  const corporateActionAlerts: string[] = [];
  const yearEnd = `${taxYear}-12-31`;
  const matchedIdentities = new Map<string, string>(); // identity → display symbol
  for (const m of matches) matchedIdentities.set(m.isin ?? m.symbol, m.symbol);

  type CaGroup = { symbol: string; descriptions: Set<string>; hasNeg: boolean; hasPos: boolean; hasRatioText: boolean; splitRows: number };
  const caByIdentity = new Map<string, CaGroup>();
  for (const t of tx) {
    if (t.eventType !== "CORPORATE_ACTION" || !inScope(t.brokerAccountId)) continue;
    if (t.eventDate > yearEnd) continue;
    const desc = t.description ?? "";
    if (/dividend/i.test(desc)) continue; // FF logs plain dividends here too
    const id = t.isin ?? t.symbol;
    if (!id) continue;
    const g = caByIdentity.get(id) ?? { symbol: t.symbol ?? id, descriptions: new Set(), hasNeg: false, hasPos: false, hasRatioText: false, splitRows: 0 };
    if (/split/i.test(desc)) {
      g.splitRows++;
      const q = Number(t.quantity ?? NaN);
      if (Number.isFinite(q) && q < 0) g.hasNeg = true;
      if (Number.isFinite(q) && q > 0) g.hasPos = true;
      if (/\d+(?:\.\d+)?\s*for\s*\d+(?:\.\d+)?/i.test(desc)) g.hasRatioText = true;
    } else {
      g.descriptions.add(desc.slice(0, 60));
    }
    caByIdentity.set(id, g);
  }
  for (const [id, g] of caByIdentity) {
    if (!matchedIdentities.has(id)) continue; // only warn when THIS report's numbers are affected
    const sym = matchedIdentities.get(id) ?? g.symbol;
    if (g.descriptions.size > 0) {
      corporateActionAlerts.push(
        `Corporate action on "${sym}" is not modeled by the FIFO engine (${[...g.descriptions][0]}…). `
        + `Its realised gains/losses in ${taxYear} may carry a wrong cost basis — verify before filing.`,
      );
    }
    if (g.splitRows > 0 && !g.hasRatioText && !(g.hasNeg && g.hasPos)) {
      corporateActionAlerts.push(
        `Share split on "${sym}" is in a form the FIFO engine could not apply (no "X for Y" ratio and no `
        + `complete −old/+new pair). Its ${taxYear} gains/losses may use the pre-split basis — verify before filing.`,
      );
    }
  }

  // Sell-coverage: |sold qty| in the year vs qty matched against lots.
  const soldQty = new Map<string, { symbol: string; qty: number }>();
  for (const t of tx) {
    if (t.eventType !== "TRADE" || !inScope(t.brokerAccountId)) continue;
    if (!t.eventDate.startsWith(yr)) continue;
    const q = Number(t.quantity ?? 0);
    if (!(q < 0)) continue;
    const id = t.isin ?? t.symbol;
    if (!id) continue;
    const cur = soldQty.get(id) ?? { symbol: t.symbol ?? id, qty: 0 };
    cur.qty += -q;
    soldQty.set(id, cur);
  }
  const matchedQty = new Map<string, number>();
  for (const m of matches) {
    const id = m.isin ?? m.symbol;
    matchedQty.set(id, (matchedQty.get(id) ?? 0) + Number(m.qty ?? 0));
  }
  for (const [id, s] of soldQty) {
    const covered = matchedQty.get(id) ?? 0;
    if (s.qty - covered > 1e-6) {
      corporateActionAlerts.push(
        `${(s.qty - covered).toFixed(4).replace(/\.?0+$/, "")} of ${s.qty} "${s.symbol}" shares sold in ${taxYear} `
        + `have NO matched acquisition lots — the cost basis is incomplete (missing statement history or an `
        + `unmodeled corporate action). The gain for the uncovered part is missing from this draft entirely.`,
      );
    }
  }

  return {
    taxYear,
    settings: {
      filingStatus: (settings?.filingStatus as "SINGLE" | "JOINT") ?? "SINGLE",
      saverAllowance: settings?.saverAllowance ?? SAVER_ALLOWANCE_DEFAULT,
      taxableIncomeEur: settings?.taxableIncomeEur ?? null,
    },
    dividends,
    interest,
    matches,
    withholding,
    classification,
    accumulatingFunds,
    corporateActionAlerts: corporateActionAlerts.length ? corporateActionAlerts : undefined,
  };
}

/**
 * Per-broker × per-formTarget subtotals from the KAP evidence, plus a note
 * of what was structurally kept OUT of Anlage KAP (T5). This is the guard
 * that would have caught the −3,269 crypto/swap leak: if a broker's rows
 * don't add up, the mismatch is visible right under the ELSTER values.
 */
export function buildReconciliation(
  draft: GermanTaxDraft,
  accountRows: Array<typeof brokerAccounts.$inferSelect>,
): {
  rows: { broker: string; formTarget: string; totalEur: number; count: number }[];
  excluded: string[];
  caveats: string[];
} {
  const byKey = new Map<string, { broker: string; formTarget: string; totalEur: number; count: number }>();
  for (const e of draft.evidence) {
    const broker = e.broker ?? "?";
    const formTarget = e.formTarget ?? "?";
    const key = `${broker}|${formTarget}`;
    const row = byKey.get(key) ?? { broker, formTarget, totalEur: 0, count: 0 };
    row.totalEur += Number(e.grossEur || "0");
    row.count += 1;
    byKey.set(key, row);
  }
  const rows = [...byKey.values()].sort(
    (a, b) => a.broker.localeCompare(b.broker) || a.formTarget.localeCompare(b.formTarget),
  );

  const excluded: string[] = [];
  const caveats: string[] = [];
  const brokers = new Set(accountRows.map(a => a.broker));
  // Real, structural exclusion: COINBASE accounts are filtered out of the KAP
  // account scope (deriveAccountScope), so crypto genuinely never reaches KAP.
  if (brokers.has("COINBASE")) excluded.push("crypto (Anlage SO, §23/§22)");
  // NOT an exclusion: the FF importer still treats equity swaps as ordinary
  // trades (swap tagging is deferred), so we must NOT claim they're filtered —
  // only flag them as unhandled so the user checks manually.
  // Only warn when the ledger actually contains swap-shaped rows. Warning
  // every Freedom user regardless trained the filer to ignore warnings and
  // cost a real filing session chasing a phantom figure (2026-07-19).
  const hasSwapRows = draft.evidence.some(
    (e) => e.symbol != null && /(^|\W)(FRHC|SWAP)(\W|$)/i.test(e.symbol),
  );
  if (hasSwapRows && brokers.has("FREEDOM_FINANCE")) {
    caveats.push(
      "Freedom equity swaps (Termingeschäfte, §20 Abs.2 Nr.3) are not yet distinguished by the importer — if you traded any, verify them manually with your Steuerberater.",
    );
  }

  return { rows, excluded, caveats };
}

export function countryFromIsin(isin?: string | null): string | undefined {
  return isin ? isin.slice(0, 2) : undefined;
}
