import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { quoteCache } from "@/lib/db/schema";

/**
 * Accepts a batch of {symbol, date, close, currency} quotes from the local
 * refresh script (scripts/refresh_quotes.py) and upserts them into
 * quote_cache. Same upsert shape the daily Stooq cron uses, so the read
 * path on the Positions page sees no difference between sources.
 *
 * Auth: Bearer CRON_SECRET.
 */

const QuoteSchema = z.object({
  symbol: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  close: z.union([z.string(), z.number()]).transform((v) => String(v)),
  currency: z.string().min(1),
});
const BodySchema = z.object({ quotes: z.array(QuoteSchema) });

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
  if (body.quotes.length === 0) {
    return NextResponse.json({ inserted: 0 });
  }
  const db = getDb();
  await db
    .insert(quoteCache)
    .values(body.quotes.map((q) => ({ ...q, source: "EXTERNAL_REFRESH" })))
    .onConflictDoUpdate({
      target: [quoteCache.symbol, quoteCache.date],
      set: {
        close: sql`excluded.close`,
        currency: sql`excluded.currency`,
        updatedAt: new Date(),
      },
    });
  return NextResponse.json({
    inserted: body.quotes.length,
    symbols: body.quotes.map((q) => q.symbol),
  });
}
