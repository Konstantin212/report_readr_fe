import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/server";
import { isAdminEmail } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/client";
import { positions, userSettings } from "@/lib/db/schema";
import { backfillHistoryForSymbols } from "@/lib/quotes/backfill";
import { hasValidCronSecret } from "@/lib/auth/cron";

export const maxDuration = 60;

const BENCHMARK_DEFAULT = "^GSPC";

/**
 * Manual rerun of history backfill — useful after a reset, a parser change,
 * or when the daily ingest backfill missed something.
 *
 * Authenticated via cron secret (for scripted use) OR an *admin* user.
 * Previously any logged-in user could trigger this; that allowed an
 * allowlisted-but-non-admin friend to burn Yahoo backfill quota and
 * affect global state (held-symbol universe is shared).
 */
export async function POST(req: Request) {
  if (!hasValidCronSecret(req)) {
    const user = await getCurrentUser();
    if (!user) return new Response("unauthorized", { status: 401 });
    if (!isAdminEmail(user.email)) return new Response("forbidden", { status: 403 });
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
