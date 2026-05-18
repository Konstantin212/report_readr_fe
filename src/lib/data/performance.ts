import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { realizedMatches } from "@/lib/db/schema";

export async function getPerformanceSummary(ownerUserId: string) {
  const db = getDb();
  const matches = await db.select().from(realizedMatches).where(eq(realizedMatches.ownerUserId, ownerUserId));
  const totalGain = matches.reduce((s, m) => s + Number(m.gainEur), 0);
  const wins = matches.filter(m => Number(m.gainEur) > 0).length;
  const losses = matches.filter(m => Number(m.gainEur) < 0).length;
  const longTerm = matches.filter(m => m.isLongTerm).length;
  return { totalGain, matchCount: matches.length, wins, losses, longTerm };
}
