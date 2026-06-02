import { NextResponse } from "next/server";
import { fetchEcbDaily } from "@/lib/quotes/ecb";
import { getDb } from "@/lib/db/client";
import { fxRates } from "@/lib/db/schema";
import { hasValidCronSecret } from "@/lib/auth/cron";

export const maxDuration = 60;

export async function GET(req: Request) {
  if (!hasValidCronSecret(req)) {
    return new Response("unauthorized", { status: 401 });
  }
  const rows = await fetchEcbDaily();
  const db = getDb();
  if (rows.length) {
    await db.insert(fxRates).values(rows).onConflictDoNothing();
  }
  return NextResponse.json({ inserted: rows.length });
}
