import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { quoteCache } from "@/lib/db/schema";
import { fetchYahooSpot } from "@/lib/quotes/yahoo-spot";

/**
 * Diagnostic: returns every quote_cache row for IEMM (latest first) plus
 * two live probes — the direct-from-Node Yahoo path AND the new Python
 * yfinance proxy — so we can see exactly which one Vercel's IPs can reach.
 */
export async function GET() {
  const db = getDb();
  const rows = await db
    .select()
    .from(quoteCache)
    .where(eq(quoteCache.symbol, "IEMM"))
    .orderBy(desc(quoteCache.date));

  const directProbe = await fetchYahooSpot("IEMM");

  let pythonProbe: unknown = null;
  let pythonProbeStatus: number | null = null;
  try {
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/yahoo_spot?symbol=IEMM`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
    });
    pythonProbeStatus = res.status;
    pythonProbe = await res.json().catch(() => null);
  } catch (e) {
    pythonProbe = { error: (e as Error).message };
  }

  return NextResponse.json({
    storedRows: rows.map((r) => ({
      date: r.date,
      close: r.close,
      currency: r.currency,
      source: r.source,
      updatedAt: r.updatedAt,
    })),
    directNodeYahooProbe: directProbe,
    pythonYfinanceProbe: { status: pythonProbeStatus, body: pythonProbe },
  });
}
