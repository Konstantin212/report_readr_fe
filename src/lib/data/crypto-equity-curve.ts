import { and, asc, eq, gte, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { cryptoDailyValues } from "@/lib/db/schema";

export type EquityCurvePoint = {
  date: string;
  valueEur: number;
};

export type Range = "1M" | "3M" | "6M" | "YTD" | "1Y" | "ALL";

function rangeStartDate(range: Range, today: Date = new Date()): string {
  const d = new Date(today);
  switch (range) {
    case "1M": d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10);
    case "3M": d.setUTCMonth(d.getUTCMonth() - 3); return d.toISOString().slice(0, 10);
    case "6M": d.setUTCMonth(d.getUTCMonth() - 6); return d.toISOString().slice(0, 10);
    case "1Y": d.setUTCFullYear(d.getUTCFullYear() - 1); return d.toISOString().slice(0, 10);
    case "YTD": return `${d.getUTCFullYear()}-01-01`;
    case "ALL": return "1970-01-01";
  }
}

export async function getCryptoEquityCurve(ownerUserId: string, range: Range = "1Y"): Promise<EquityCurvePoint[]> {
  const start = rangeStartDate(range);
  const rows = await getDb()
    .select({
      date: cryptoDailyValues.date,
      valueEur: sql<string>`sum(${cryptoDailyValues.valueEur})`,
    })
    .from(cryptoDailyValues)
    .where(and(eq(cryptoDailyValues.ownerUserId, ownerUserId), gte(cryptoDailyValues.date, start)))
    .groupBy(cryptoDailyValues.date)
    .orderBy(asc(cryptoDailyValues.date));

  return rows.map((r) => ({ date: r.date, valueEur: Number(r.valueEur) }));
}
