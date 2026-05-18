import { NextResponse } from "next/server";
import { fetchEcbDaily } from "@/lib/quotes/ecb";
import { getDb } from "@/lib/db/client";
import { fxRates } from "@/lib/db/schema";

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const rows = await fetchEcbDaily();
  const db = getDb();
  for (const r of rows) {
    await db.insert(fxRates).values(r).onConflictDoNothing();
  }
  return NextResponse.json({ inserted: rows.length });
}
