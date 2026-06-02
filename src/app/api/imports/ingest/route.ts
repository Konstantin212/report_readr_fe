import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/server";
import { ingestParsedImport } from "@/lib/imports/ingest";
import { backfillHistoryForSymbols } from "@/lib/quotes/backfill";

export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await requireCurrentUser();
  const body = await req.json();
  try {
    const summary = await ingestParsedImport(user.id, body);

    // Fire-and-forget: backfill price history for any symbols seen in this import.
    // Doesn't block the response — the user sees "PARSED" immediately; charts fill in
    // as Yahoo returns history (~700 ms per symbol, throttled).
    const symbols = Array.isArray(body?.events)
      ? Array.from(
          new Set(
            (body.events as Array<{ symbol?: string }>)
              .map((e) => e.symbol)
              .filter((s): s is string => Boolean(s)),
          ),
        )
      : [];
    void backfillHistoryForSymbols(symbols).catch(() => {
      // Swallow — backfill failures shouldn't surface on the ingest path.
    });

    return NextResponse.json(summary);
  } catch (err) {
    // Log the underlying cause server-side (visible in Vercel function
    // logs) but never reflect raw DB / Drizzle errors to the client —
    // they leak table names, constraint identifiers, and sometimes
    // values.
    console.error("imports/ingest failed", err);
    const message = err instanceof Error && err.message.startsWith("INVALID_PAYLOAD")
      ? "Invalid import payload."
      : "Could not save the import.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
