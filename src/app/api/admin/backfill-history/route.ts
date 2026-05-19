import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db/client";
import { positions, userSettings } from "@/lib/db/schema";
import { backfillHistoryForSymbols } from "@/lib/quotes/backfill";

export const maxDuration = 60;

const BENCHMARK_DEFAULT = "^GSPC";

/**
 * Manual rerun of history backfill — useful after a reset, a parser change,
 * or when the daily ingest backfill missed something.
 *
 * Authenticated via cron secret (for scripted use) OR a logged-in user (single
 * tenant: any logged-in user can rerun their own / shared history).
 */
export async function POST(req: Request) {
  const authedByCron =
    req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`;
  if (!authedByCron) {
    const user = await getCurrentUser();
    if (!user) return new Response("unauthorized", { status: 401 });
  }
  const db = getDb();
  const heldRows = await db.selectDistinct({ s: positions.symbol }).from(positions);
  const benchRows = await db.selectDistinct({ s: userSettings.benchmarkSymbol }).from(userSettings);
  const benchmarks = benchRows.map((b) => b.s).filter(Boolean);
  if (benchmarks.length === 0) benchmarks.push(BENCHMARK_DEFAULT);
  const universe = Array.from(
    new Set([...heldRows.map((h) => h.s).filter(Boolean), ...benchmarks]),
  );
  const result = await backfillHistoryForSymbols(universe);
  return NextResponse.json({ universe: universe.length, ...result });
}
