import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  brokerAccounts, lots, transactions,
} from "@/lib/db/schema";
import { topDividendPayers } from "@/lib/analytics/top-payers";
import { projectDividends } from "@/lib/analytics/dividend-projection";
import { yieldOnCost } from "@/lib/analytics/yield-on-cost";

export type DividendRow = { date: string; ticker: string; broker: string; ccy: string; amount: number; amountEur: number; whtEur: number };
export type DividendsData = {
  hero: { ytdEur: number; whtPaidEur: number; distributionCount: number; yoyPct: number | null };
  yield: { pct: number; targetPct: number };
  projection: { yearEur: number; next30DaysEur: number; next30Count: number };
  monthly: { values: number[]; labels: string[]; highlightIdx: number };
  rows: DividendRow[];
  topPayers: { ticker: string; totalEur: number; count: number; yieldPct?: number }[];
};

export async function getDividendsData(
  ownerUserId: string,
  broker: "all" | "ff" | "ibkr" = "all",
): Promise<DividendsData> {
  const db = getDb();
  const accountFilter = broker === "all" ? null : broker === "ff" ? "FREEDOM_FINANCE" : "INTERACTIVE_BROKERS";
  const accountRows = await db.select().from(brokerAccounts).where(eq(brokerAccounts.ownerUserId, ownerUserId));
  const accountIds = accountFilter
    ? accountRows.filter(a => a.broker === accountFilter).map(a => a.id)
    : accountRows.map(a => a.id);
  const accountIdsSet = new Set(accountIds);
  const brokerById = new Map(accountRows.map(a => [a.id, a.broker === "FREEDOM_FINANCE" ? "FF" : "IBKR"]));

  const allTx = await db.select().from(transactions).where(eq(transactions.ownerUserId, ownerUserId));
  const filteredTx = accountFilter ? allTx.filter(t => t.brokerAccountId && accountIdsSet.has(t.brokerAccountId)) : allTx;
  const divs = filteredTx.filter(t => t.eventType === "DIVIDEND");

  const yr = new Date().getFullYear();
  const yrStr = String(yr);
  const lastYrStr = String(yr - 1);
  const ytdDivs = divs.filter(d => d.eventDate.startsWith(yrStr));
  const lyDivs = divs.filter(d => d.eventDate.startsWith(lastYrStr));
  const ytdEur = ytdDivs.reduce((s, d) => s + Number(d.amountEur ?? 0), 0);
  const lyEur = lyDivs.reduce((s, d) => s + Number(d.amountEur ?? 0), 0);
  const whtPaidEur = ytdDivs.reduce((s, d) => s + Number(d.withholdingTaxEur ?? 0), 0);
  const yoyPct = lyEur > 0 ? ((ytdEur - lyEur) / lyEur) * 100 : null;

  // monthly bars: 12 months ending at current month
  const labels: string[] = [];
  const values: number[] = new Array(12).fill(0);
  const monthAbbr = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  for (let i = 0; i < 12; i++) {
    const d = new Date(yr, new Date().getMonth() - 11 + i, 1);
    labels.push(monthAbbr[d.getMonth()]);
  }
  const startMonth = new Date(yr, new Date().getMonth() - 11, 1);
  for (const d of divs) {
    const dt = new Date(d.eventDate);
    if (dt < startMonth) continue;
    const idx = (dt.getFullYear() - startMonth.getFullYear()) * 12 + dt.getMonth() - startMonth.getMonth();
    if (idx >= 0 && idx < 12) values[idx] += Number(d.amountEur ?? 0);
  }
  const highlightIdx = 11 - (12 - 1 - new Date().getMonth() % 12);

  // Total cost basis for yield-on-cost
  const allLots = await db.select().from(lots).where(eq(lots.ownerUserId, ownerUserId));
  const filteredLots = accountFilter ? allLots.filter(l => accountIdsSet.has(l.brokerAccountId)) : allLots;
  const totalCost = filteredLots.reduce((s, l) => s + Number(l.costEur), 0);

  // TTM dividends
  const ttmCutoff = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const ttm = divs.filter(d => d.eventDate >= ttmCutoff);
  const ttmEur = ttm.reduce((s, d) => s + Number(d.amountEur ?? 0), 0);
  const yieldPct = yieldOnCost(ttmEur, totalCost) * 100;

  const projection = projectDividends(
    ttm.map(d => ({ date: d.eventDate, amountEur: Number(d.amountEur ?? 0) })),
    [],
    new Date(),
  );

  const rows: DividendRow[] = divs.sort((a, b) => b.eventDate.localeCompare(a.eventDate)).map(d => ({
    date: d.eventDate,
    ticker: d.symbol ?? "—",
    broker: brokerById.get(d.brokerAccountId ?? "") ?? "?",
    ccy: d.currency,
    amount: Number(d.amount ?? 0),
    amountEur: Number(d.amountEur ?? 0),
    whtEur: Number(d.withholdingTaxEur ?? 0),
  }));

  // Top payers TTM
  const top = topDividendPayers(
    ttm.map(d => ({ ticker: d.symbol ?? "—", amountEur: Number(d.amountEur ?? 0) })),
    5,
  );

  return {
    hero: { ytdEur, whtPaidEur, distributionCount: ytdDivs.length, yoyPct },
    yield: { pct: yieldPct, targetPct: 4 },
    projection,
    monthly: { values, labels, highlightIdx },
    rows,
    topPayers: top,
  };
}
