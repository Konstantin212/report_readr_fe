import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { getPositionsData } from "@/lib/data/positions";

export const maxDuration = 30;

/** Detail for a single position (sparkline, lots, transactions, meta),
 *  fetched on demand when the user opens a row. React Query caches it per
 *  symbol, so re-opening a position is instant. Owner-scoped via session. */
export async function GET(req: Request, ctx: { params: Promise<{ symbol: string }> }) {
  const u = await getCurrentUser();
  if (!u) return new NextResponse("unauthorized", { status: 401 });

  const { symbol } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const brokerParam = sp.get("broker");
  const broker = brokerParam === "ff" || brokerParam === "ibkr" ? brokerParam : "all";
  const sector = sp.get("sector");

  const data = await getPositionsData(u.id, { broker, sector, symbol });
  if (!data.selected) return new NextResponse("not found", { status: 404 });
  return NextResponse.json(data.selected);
}
