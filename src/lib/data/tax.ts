import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { realizedMatches, transactions, userSettings, brokerAccounts, positions as positionsTable } from "@/lib/db/schema";
import { buildAnlageKap, type BuildAnlageKapInput, type LegacyGermanTaxDraft as GermanTaxDraft } from "@/lib/tax/german-tax";
import { applyBucketIsolation } from "@/lib/tax/bucket-isolation";
import { classifyKind, classifySector } from "@/lib/analytics/sector-map";

/**
 * Returns the distinct tax years a user has any tax-relevant activity in
 * (a realized match closed, a dividend received, an interest payment, a
 * withholding-tax line). Sorted newest-first so the most recent year is
 * the default selection.
 *
 * If the user has no activity at all the current calendar year is
 * surfaced as a single-entry placeholder so the selector isn't empty.
 */
export async function getAvailableTaxYears(ownerUserId: string): Promise<number[]> {
  const db = getDb();
  const [matches, txYears] = await Promise.all([
    db
      .select({ closedAt: realizedMatches.closedAt })
      .from(realizedMatches)
      .where(eq(realizedMatches.ownerUserId, ownerUserId)),
    db
      .select({ eventDate: transactions.eventDate, eventType: transactions.eventType })
      .from(transactions)
      .where(eq(transactions.ownerUserId, ownerUserId)),
  ]);
  const years = new Set<number>();
  for (const m of matches) {
    const y = Number(m.closedAt.slice(0, 4));
    if (Number.isFinite(y)) years.add(y);
  }
  for (const t of txYears) {
    if (t.eventType !== "DIVIDEND" && t.eventType !== "INTEREST" && t.eventType !== "WITHHOLDING_TAX") continue;
    const y = Number(t.eventDate.slice(0, 4));
    if (Number.isFinite(y)) years.add(y);
  }
  if (years.size === 0) years.add(new Date().getFullYear());
  return [...years].sort((a, b) => b - a);
}

const ABGELT_RATE = 0.26375; // 25 % AbgSt + 5.5 % SolZ

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

export type TaxForecast = {
  // Date the projection was computed (today).
  asOfDate: string;
  // Days remaining until 31 Dec of this tax year.
  daysRemaining: number;
  // Projected additional dividends from currently-held positions over the
  // remaining-year window, based on TTM dividend run-rate.
  additionalDividendsEur: number;
  // Forecasted year-end totals (actual + projected). The "used" / "pct"
  // fields are clipped to the allowance the same way the actual ones are.
  usedEur: number;
  pct: number;
  taxableBaseEur: number;
  estTaxEur: number;
};

export type TaxData = {
  year: number;
  hero: { netRealizedEur: number; taxableBaseEur: number; estTaxEur: number };
  allowance: {
    usedEur: number;
    totalEur: number;
    pct: number;
    fxAdjustmentsEur: number;
    whtPaidEur: number;
    // Breakdown of what's consuming the allowance this year — each
    // contributes to `usedEur`. Surfaced in the UI so it's clear that
    // dividends, realised gains and interest share the same €1k/2k.
    breakdown: { dividendsEur: number; realizedGainsEur: number; interestEur: number };
  };
  /** Year-end projection. Only populated for the current calendar year;
   *  past years return null. UI-only — does NOT affect the hero totals,
   *  the realised-lots table, the Anlage KAP draft, or the export. */
  forecast: TaxForecast | null;
  realizedLots: { ticker: string; broker: string; method: string; opened: string; closed: string; qty: number; costEur: number; proceedsEur: number; gainEur: number }[];
  kap: GermanTaxDraft;
};

export async function loadTaxInputs(ownerUserId: string, taxYear: number): Promise<BuildAnlageKapInput> {
  const db = getDb();
  const [settingsRows, tx, allMatches] = await Promise.all([
    db.select().from(userSettings).where(eq(userSettings.ownerUserId, ownerUserId)),
    db.select().from(transactions).where(eq(transactions.ownerUserId, ownerUserId)),
    db.select().from(realizedMatches).where(eq(realizedMatches.ownerUserId, ownerUserId)),
  ]);
  return buildKapInputs(taxYear, settingsRows[0], tx, allMatches);
}

/**
 * Pure assembly of the BuildAnlageKapInput from already-loaded rows.
 * `getTaxData` reuses this to avoid re-querying transactions / matches /
 * settings a second time on every Tax page render — those three tables
 * are already in memory by the time we compute the KAP draft.
 */
function buildKapInputs(
  taxYear: number,
  settings: typeof userSettings.$inferSelect | undefined,
  tx: Array<typeof transactions.$inferSelect>,
  allMatches: Array<typeof realizedMatches.$inferSelect>,
): BuildAnlageKapInput {
  const yr = String(taxYear);
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
      && !isAccrualSource(t.source ?? null)
    )
    .map(t => ({
      ticker: t.symbol ?? "",
      country: countryFromIsin(t.isin),
      grossEur: t.amountEur ?? "0",
      whtEur: t.withholdingTaxEur ?? "0",
    }));
  const interest = tx
    .filter(t => t.eventType === "INTEREST" && t.eventDate.startsWith(yr))
    .map(t => ({ grossEur: t.amountEur ?? "0" }));
  const matches = allMatches
    .filter(m => m.closedAt.startsWith(yr))
    .map(m => ({ symbol: m.symbol, gainEur: m.gainEur, closedAt: m.closedAt }));
  return {
    taxYear,
    settings: {
      filingStatus: (settings?.filingStatus as "SINGLE" | "JOINT") ?? "SINGLE",
      saverAllowance: settings?.saverAllowance ?? "1000",
    },
    dividends,
    interest,
    matches,
  };
}

export async function getTaxData(ownerUserId: string, year: number): Promise<TaxData> {
  const db = getDb();
  const yrStr = String(year);
  const [accountRows, allMatches, allTx, settingsRows] = await Promise.all([
    db.select().from(brokerAccounts).where(eq(brokerAccounts.ownerUserId, ownerUserId)),
    db.select().from(realizedMatches).where(eq(realizedMatches.ownerUserId, ownerUserId)),
    db.select().from(transactions).where(eq(transactions.ownerUserId, ownerUserId)),
    db.select().from(userSettings).where(eq(userSettings.ownerUserId, ownerUserId)),
  ]);
  // Anlage KAP is §20 EStG (capital income from securities). Crypto sale
  // gains are §23 EStG (private sales) and belong on Anlage SO; staking
  // is §22 Nr. 3. Exclude COINBASE broker_account rows so crypto matches
  // don't double-count into Anlage KAP's netRealized / dividends figures.
  const stockAccountIds = new Set(
    accountRows.filter(a => a.broker !== "COINBASE").map(a => a.id),
  );
  const brokerById = new Map(
    accountRows
      .filter(a => a.broker !== "COINBASE")
      .map(a => [a.id, a.broker === "FREEDOM_FINANCE" ? "FF" : "IBKR"]),
  );

  const yrMatches = allMatches.filter(
    m => m.closedAt.startsWith(yrStr) && stockAccountIds.has(m.brokerAccountId),
  );
  const netRealized = yrMatches.reduce((s, m) => s + Number(m.gainEur), 0);

  const yrDivs = allTx.filter(t =>
    t.eventType === "DIVIDEND"
    && t.eventDate.startsWith(yrStr)
    && !isAccrualSource(t.source ?? null)
  );
  const dividendsEur = yrDivs.reduce((s, t) => s + Number(t.amountEur ?? 0), 0);
  const whtPaid = yrDivs.reduce((s, t) => s + Number(t.withholdingTaxEur ?? 0), 0);
  const yrInterest = allTx.filter(t => t.eventType === "INTEREST" && t.eventDate.startsWith(yrStr));
  const interestEur = yrInterest.reduce((s, t) => s + Number(t.amountEur ?? 0), 0);

  const settings = settingsRows[0];
  const allowance = Number(settings?.saverAllowance ?? "1000");

  // §20 Abs. 6 EStG bucket isolation: Aktien (individual-stock) losses
  // cannot offset Sonstige (ETF/bond/dividend/interest) income. We split
  // realised gains per match using the same classifier the positions
  // table uses. Without this the dashboard understates the taxable base
  // by the size of any wasted stock-loss — the bug that surfaced as a
  // mismatch between this page (€167) and the loss-harvest page (€171).
  let aktienRealisedNetEur = 0;
  let sonstigeRealisedNetEur = 0;
  for (const m of yrMatches) {
    const sector = classifySector(m.symbol);
    const kind = classifyKind(m.symbol, sector);
    const gain = Number(m.gainEur);
    if (kind === "stock") aktienRealisedNetEur += gain;
    else sonstigeRealisedNetEur += gain;
  }
  // netRealized retains its aggregate definition (sum across both buckets)
  // — that's what the "REALISED" breakdown number means on the dashboard.

  const bucket = applyBucketIsolation({
    aktienRealisedNetEur,
    sonstigeRealisedNetEur,
    dividendsEur,
    interestEur,
    forecastDividendsEur: 0,
    allowanceEur: allowance,
  });
  const taxableBase = bucket.taxableBaseEur;
  const estTax = taxableBase * ABGELT_RATE;
  const usedEur = bucket.usedEur;
  const pct = allowance > 0 ? Math.min(100, Math.max(0, (bucket.combinedNetEur / allowance) * 100)) : 0;

  // FX adjustments: events with fxSource=ECB AND raw.brokerEurAmount → delta sum
  // v2: best-effort — sum (amountEur - brokerEur) where broker raw includes EUR equivalent
  let fxAdjustments = 0;
  for (const t of allTx) {
    if (t.eventDate.startsWith(yrStr) && t.fxSource === "ECB" && t.amountEur && t.raw && typeof t.raw === "object") {
      const raw = t.raw as Record<string, unknown>;
      const brokerEur = raw["brokerEurAmount"];
      if (typeof brokerEur === "number") fxAdjustments += Number(t.amountEur) - brokerEur;
      else if (typeof brokerEur === "string") fxAdjustments += Number(t.amountEur) - Number(brokerEur);
    }
  }

  const realizedLots = yrMatches.map(m => ({
    ticker: m.symbol,
    broker: brokerById.get(m.brokerAccountId) ?? "?",
    method: "FIFO",
    opened: "—", // v2: openingFingerprint doesn't carry the opened date; v3 will link back to lot/transaction
    closed: m.closedAt,
    qty: Number(m.qty),
    costEur: Number(m.costEur),
    proceedsEur: Number(m.proceedsEur),
    gainEur: Number(m.gainEur),
  }));

  // Reuse the rows we already loaded above — avoids three redundant
  // round-trips that `loadTaxInputs` would otherwise re-issue.
  const kap = buildAnlageKap(buildKapInputs(year, settings, allTx, allMatches));

  // ---- Forecast (current year only) -----------------------------------
  // Projects how much more of the Pauschbetrag is likely to be consumed
  // between now and Dec 31, based on the TTM dividend run-rate of the
  // positions you currently hold. Strictly UI-helper — the Anlage KAP
  // draft, hero totals, export, and CSV all stay on realised numbers.
  let forecast: TaxForecast | null = null;
  const today = new Date();
  if (year === today.getFullYear()) {
    const todayStr = today.toISOString().slice(0, 10);
    const ttmStart = new Date(today.getTime() - 365 * 86400000).toISOString().slice(0, 10);
    const heldRows = await db
      .select({ symbol: positionsTable.symbol, isin: positionsTable.isin })
      .from(positionsTable)
      .where(eq(positionsTable.ownerUserId, ownerUserId));
    const heldSymbols = new Set(heldRows.map(p => p.symbol).filter(Boolean));
    const heldIsins = new Set(heldRows.map(p => p.isin).filter(Boolean) as string[]);
    // Sum TTM dividends only for symbols currently held — past sold
    // positions don't pay you any more, so they shouldn't anchor the
    // forecast.
    let ttmHeldDivsEur = 0;
    for (const t of allTx) {
      if (t.eventType !== "DIVIDEND") continue;
      if (t.eventDate < ttmStart || t.eventDate >= todayStr) continue;
      const symMatch = t.symbol && heldSymbols.has(t.symbol);
      const isinMatch = t.isin && heldIsins.has(t.isin);
      if (!symMatch && !isinMatch) continue;
      ttmHeldDivsEur += Number(t.amountEur ?? 0);
    }
    // Days remaining until Dec 31 of the tax year (inclusive of end-of-day).
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);
    const daysRemaining = Math.max(
      0,
      Math.floor((yearEnd.getTime() - today.getTime()) / 86_400_000),
    );
    const additionalDividendsEur = ttmHeldDivsEur * (daysRemaining / 365);
    // Re-apply bucket isolation including the projected dividends (which
    // fall entirely into Sonstige under §20 Abs. 1 Nr. 1 EStG).
    const forecastBucket = applyBucketIsolation({
      aktienRealisedNetEur,
      sonstigeRealisedNetEur,
      dividendsEur,
      interestEur,
      forecastDividendsEur: additionalDividendsEur,
      allowanceEur: allowance,
    });
    const forecastPct = allowance > 0
      ? Math.min(100, Math.max(0, (forecastBucket.forecastCombinedNetEur / allowance) * 100))
      : 0;
    forecast = {
      asOfDate: todayStr,
      daysRemaining,
      additionalDividendsEur,
      usedEur: forecastBucket.forecastUsedEur,
      pct: forecastPct,
      taxableBaseEur: forecastBucket.forecastTaxableBaseEur,
      estTaxEur: forecastBucket.forecastTaxableBaseEur * ABGELT_RATE,
    };
  }

  return {
    year,
    hero: { netRealizedEur: netRealized, taxableBaseEur: taxableBase, estTaxEur: estTax },
    allowance: {
      usedEur,
      totalEur: allowance,
      pct,
      fxAdjustmentsEur: fxAdjustments,
      whtPaidEur: whtPaid,
      breakdown: {
        dividendsEur,
        realizedGainsEur: netRealized,
        interestEur,
      },
    },
    forecast,
    realizedLots,
    kap,
  };
}

function countryFromIsin(isin?: string | null): string | undefined {
  return isin ? isin.slice(0, 2) : undefined;
}
