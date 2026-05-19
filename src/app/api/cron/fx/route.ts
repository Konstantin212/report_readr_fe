import { NextResponse } from "next/server";
import { fetchEcbDaily } from "@/lib/quotes/ecb";
import { getDb } from "@/lib/db/client";
import { fxRates } from "@/lib/db/schema";

export const maxDuration = 60;

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const rows = await fetchEcbDaily();
  const db = getDb();
  if (rows.length) {
    await db.insert(fxRates).values(rows).onConflictDoNothing();
  }
  return NextResponse.json({ inserted: rows.length });
}
