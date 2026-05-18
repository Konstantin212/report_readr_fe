import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { positions, realizedMatches } from "@/lib/db/schema";

export async function getDashboardSummary(ownerUserId: string) {
  const db = getDb();
  const pos = await db.select().from(positions).where(eq(positions.ownerUserId, ownerUserId));
  const allMatches = await db.select().from(realizedMatches).where(eq(realizedMatches.ownerUserId, ownerUserId));
  const yr = String(new Date().getFullYear());
  const realizedYtd = allMatches
    .filter(m => m.closedAt.startsWith(yr))
    .reduce((s, m) => s + Number(m.gainEur), 0);
  return {
    positionCount: pos.length,
    realizedYtd,
  };
}
