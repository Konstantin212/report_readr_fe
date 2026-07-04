import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/server";
import { ingestParsedImport } from "@/lib/imports/ingest";
import { backfillHistoryForSymbols } from "@/lib/quotes/backfill";
import { enrichInstruments } from "@/lib/marketdata/enrich";
import type { InstrumentRef } from "@/lib/marketdata/types";

export const maxDuration = 60;

// Reject oversized bodies before buffering the JSON. A real multi-year
// statement export is a few MB at most; 25 MB is a generous ceiling that
// still blocks a hostile client from forcing us to buffer arbitrary data.
const MAX_BODY_BYTES = 25 * 1024 * 1024;

/** Distinct {isin, symbol, currency} refs from the import events, ISIN required. */
function collectRefs(body: unknown): InstrumentRef[] {
  const events = (body as { events?: unknown })?.events;
  if (!Array.isArray(events)) return [];
  const seen = new Set<string>();
  const refs: InstrumentRef[] = [];
  for (const e of events as Array<{ isin?: string; symbol?: string; currency?: string | null }>) {
    if (!e?.isin) continue;
    const symbol = e.symbol ?? "";
    const key = `${e.isin}|${symbol}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ isin: e.isin, symbol, currency: e.currency ?? null });
  }
  return refs;
}

export async function POST(req: Request) {
  const user = await requireCurrentUser();

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Import payload too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  try {
    const summary = await ingestParsedImport(user.id, body);

    // Fire-and-forget: backfill price history for any symbols seen in this import.
    // Doesn't block the response — the user sees "PARSED" immediately; charts fill in
    // as Yahoo returns history (~700 ms per symbol, throttled).
    const bodyEvents = (body as { events?: unknown })?.events;
    const symbols = Array.isArray(bodyEvents)
      ? Array.from(
          new Set(
            (bodyEvents as Array<{ symbol?: string }>)
              .map((e) => e.symbol)
              .filter((s): s is string => Boolean(s)),
          ),
        )
      : [];
    void backfillHistoryForSymbols(symbols).catch(() => {
      // Swallow — backfill failures shouldn't surface on the ingest path.
    });

    // Fire-and-forget: enrich metadata for any ISIN-bearing instruments in
    // this import (classification + fund facts, and an EOD quote for ETFs).
    // Not awaited — must not add latency to the ingest response.
    const refs = collectRefs(body);
    if (refs.length) {
      void enrichInstruments(refs).catch(() => {
        // Swallow — enrichment failures shouldn't surface on the ingest path.
      });
    }

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
