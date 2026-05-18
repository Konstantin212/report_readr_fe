import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { realizedMatches, transactions, userSettings } from "@/lib/db/schema";
import type { BuildAnlageKapInput } from "@/lib/tax/german-tax";

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

function countryFromIsin(isin?: string | null): string | undefined {
  return isin ? isin.slice(0, 2) : undefined;
}
