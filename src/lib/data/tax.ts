import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { realizedMatches, transactions, userSettings, brokerAccounts } from "@/lib/db/schema";
import { buildAnlageKap, type BuildAnlageKapInput, type GermanTaxDraft } from "@/lib/tax/german-tax";

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
  const matches = await db
    .select({ closedAt: realizedMatches.closedAt })
    .from(realizedMatches)
    .where(eq(realizedMatches.ownerUserId, ownerUserId));
  const txYears = await db
    .select({ eventDate: transactions.eventDate, eventType: transactions.eventType })
    .from(transactions)
    .where(eq(transactions.ownerUserId, ownerUserId));
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

export type TaxData = {
  year: number;
  hero: { netRealizedEur: number; taxableBaseEur: number; estTaxEur: number };
  allowance: { usedEur: number; totalEur: number; pct: number; fxAdjustmentsEur: number; whtPaidEur: number };
  realizedLots: { ticker: string; broker: string; method: string; opened: string; closed: string; qty: number; costEur: number; proceedsEur: number; gainEur: number }[];
  kap: GermanTaxDraft;
};

export async function loadTaxInputs(ownerUserId: string, taxYear: number): Promise<BuildAnlageKapInput> {
  const db = getDb();
  const settings = (await db.select().from(userSettings).where(eq(userSettings.ownerUserId, ownerUserId)))[0];
  const yr = String(taxYear);
  const tx = await db.select().from(transactions).where(eq(transactions.ownerUserId, ownerUserId));
  const dividends = tx
    .filter(t => t.eventType === "DIVIDEND" && t.eventDate.startsWith(yr))
    .map(t => ({
      ticker: t.symbol ?? "",
      country: countryFromIsin(t.isin),
      grossEur: t.amountEur ?? "0",
      whtEur: t.withholdingTaxEur ?? "0",
    }));
  const interest = tx
    .filter(t => t.eventType === "INTEREST" && t.eventDate.startsWith(yr))
    .map(t => ({ grossEur: t.amountEur ?? "0" }));
  const matches = (await db.select().from(realizedMatches).where(eq(realizedMatches.ownerUserId, ownerUserId)))
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
  const accountRows = await db.select().from(brokerAccounts).where(eq(brokerAccounts.ownerUserId, ownerUserId));
  const brokerById = new Map(accountRows.map(a => [a.id, a.broker === "FREEDOM_FINANCE" ? "FF" : "IBKR"]));

  const allMatches = await db.select().from(realizedMatches).where(eq(realizedMatches.ownerUserId, ownerUserId));
  const yrStr = String(year);
  const yrMatches = allMatches.filter(m => m.closedAt.startsWith(yrStr));
  const netRealized = yrMatches.reduce((s, m) => s + Number(m.gainEur), 0);

  const allTx = await db.select().from(transactions).where(eq(transactions.ownerUserId, ownerUserId));
  const yrDivs = allTx.filter(t => t.eventType === "DIVIDEND" && t.eventDate.startsWith(yrStr));
  const dividendsEur = yrDivs.reduce((s, t) => s + Number(t.amountEur ?? 0), 0);
  const whtPaid = yrDivs.reduce((s, t) => s + Number(t.withholdingTaxEur ?? 0), 0);

  const settings = (await db.select().from(userSettings).where(eq(userSettings.ownerUserId, ownerUserId)))[0];
  const allowance = Number(settings?.saverAllowance ?? "1000");

  const taxableBase = Math.max(0, netRealized + dividendsEur - allowance);
  const estTax = taxableBase * ABGELT_RATE;

  const usedEur = Math.min(dividendsEur, allowance);
  const pct = Math.min(100, (dividendsEur / allowance) * 100);

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

  const kapInput = await loadTaxInputs(ownerUserId, year);
  const kap = buildAnlageKap(kapInput);

  return {
    year,
    hero: { netRealizedEur: netRealized, taxableBaseEur: taxableBase, estTaxEur: estTax },
    allowance: { usedEur, totalEur: allowance, pct, fxAdjustmentsEur: fxAdjustments, whtPaidEur: whtPaid },
    realizedLots,
    kap,
  };
}

function countryFromIsin(isin?: string | null): string | undefined {
  return isin ? isin.slice(0, 2) : undefined;
}
