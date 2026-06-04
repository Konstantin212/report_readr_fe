import { sql, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { imports } from "@/lib/db/schema";

/**
 * Number of imports the user has ever ingested. Used by the app layout
 * to decide whether to auto-open the welcome tour for first-run users.
 *
 * Note: a Coinbase-only user technically has zero `imports` (sync runs
 * via API key, not file upload). That's OK — the tour also helps them
 * find the Settings page.
 */
export async function getImportCount(ownerUserId: string): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(imports)
    .where(eq(imports.ownerUserId, ownerUserId));
  return rows[0]?.n ?? 0;
}
