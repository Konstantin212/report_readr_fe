import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { quoteHistory } from "@/lib/db/schema";

/**
 * Bulk upload of historical daily closes from the local refresh script
 * (scripts/refresh_history.py — yfinance, runs on a residential IP because
 * Yahoo blocks Vercel's egress). Receives raw history rows and inserts
 * them into quote_history with ON CONFLICT DO NOTHING — the (symbol, date)
 * PK keeps re-runs idempotent.
 *
 * Auth: Bearer CRON_SECRET.
 *
 * Chunked at 1000 rows per insert so a multi-year, multi-symbol upload
 * doesn't blow the 65 535 Postgres parameter limit (~5 columns × 1000 =
 * 5 000 params per query — comfortable margin).
 */

export const maxDuration = 60;

const RowSchema = z.object({
  symbol: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  close: z.union([z.string(), z.number()]).transform((v) => String(v)),
  currency: z.string().min(1),
});
const BodySchema = z.object({ rows: z.array(RowSchema) });

export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("unauthorized", { status: 401 });
  }
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  if (body.rows.length === 0) {
    return NextResponse.json({ inserted: 0, total: 0 });
  }
  const db = getDb();
  const CHUNK = 1000;
  let totalInserted = 0;
  for (let i = 0; i < body.rows.length; i += CHUNK) {
    const slice = body.rows.slice(i, i + CHUNK);
    const r = await db
      .insert(quoteHistory)
      .values(slice)
      .onConflictDoNothing()
      .returning({ s: quoteHistory.symbol });
    totalInserted += r.length;
  }
  return NextResponse.json({
    inserted: totalInserted,
    total: body.rows.length,
    duplicates: body.rows.length - totalInserted,
  });
}
