import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { lots, quoteCache } from "@/lib/db/schema";

export type PositionRow = {
  symbol: string;
  quantity: number;
  costEur: number;
  marketEur: number | null;
  pl: number | null;
  asOf: string | null;
};

export async function getPositions(ownerUserId: string): Promise<PositionRow[]> {
  const db = getDb();
  const lotRows = await db.select().from(lots).where(eq(lots.ownerUserId, ownerUserId));
  const bySymbol = new Map<string, { qty: number; cost: number }>();
  for (const l of lotRows) {
    const acc = bySymbol.get(l.symbol) ?? { qty: 0, cost: 0 };
    acc.qty += Number(l.remainingQty);
    acc.cost += Number(l.costEur);
    bySymbol.set(l.symbol, acc);
  }
  const symbols = [...bySymbol.keys()];
  if (!symbols.length) return [];
  // Load latest quote per symbol (best-effort; quote_cache may be empty in dev)
  const quoteRows = await db.select().from(quoteCache);
  const latestQuote = new Map<string, { close: number; date: string }>();
  for (const q of quoteRows) {
    const prev = latestQuote.get(q.symbol);
    if (!prev || q.date > prev.date) latestQuote.set(q.symbol, { close: Number(q.close), date: q.date });
  }
  return symbols.map(symbol => {
    const { qty, cost } = bySymbol.get(symbol)!;
    const q = latestQuote.get(symbol);
    const marketEur = q ? qty * q.close : null;
    const pl = marketEur !== null ? marketEur - cost : null;
    return { symbol, quantity: qty, costEur: cost, marketEur, pl, asOf: q?.date ?? null };
  });
}
