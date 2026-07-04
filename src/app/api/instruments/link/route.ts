import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { enrichSingle } from "@/lib/marketdata/enrich";
import { parseManualLink } from "@/lib/marketdata/manual-link";
import { getUserInstruments } from "@/lib/marketdata/store";
import { syntheticIsin } from "@/lib/marketdata/types";

// justETF/Yahoo scrapes go over the network; enrichSingle bypasses the TTL
// gate and hits a provider synchronously, so give it Node runtime + headroom.
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Manual "data source" link: the user pastes a Yahoo / justETF / Google /
 * Stockopedia URL to pin an instrument's classification when auto-resolution
 * missed it. We parse the link, resolve an ISIN to key the metadata row, run
 * one immediate enrichment, and echo the resulting InstrumentMeta back so the
 * detail card can re-render populated.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { symbol?: unknown; isin?: unknown; url?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const symbol = typeof body.symbol === "string" ? body.symbol.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const passedIsin = typeof body.isin === "string" ? body.isin.trim() : "";
  if (!symbol) return NextResponse.json({ error: "Missing symbol." }, { status: 400 });
  if (!url) return NextResponse.json({ error: "Missing url." }, { status: 400 });

  const parsed = parseManualLink(url);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 422 });
  }

  // Resolve the ISIN that keys instrument_meta, in priority order:
  //   1. the ISIN embedded in the parsed link (justETF, or a Yahoo ISIN URL)
  //   2. an ISIN the client passed alongside the symbol
  //   3. the user's own instruments row for this symbol
  //   4. a synthetic SYM:{symbol} key (manual Yahoo links with no ISIN)
  const linkIsin = "isin" in parsed ? parsed.isin : undefined;
  let isin = linkIsin || passedIsin || null;
  if (!isin) {
    const rows = await getUserInstruments(user.id);
    isin = rows.find((r) => r.symbol === symbol)?.isin ?? null;
  }
  if (!isin) isin = syntheticIsin(symbol);

  const meta = await enrichSingle({ isin, symbol, currency: null }, parsed, url);
  if (!meta) {
    return NextResponse.json({ error: "Enrichment returned no data." }, { status: 502 });
  }
  return NextResponse.json(meta);
}
