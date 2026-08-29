import { cache } from "react";
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
 *
 * Wrapped in React `cache()`: the app layout and the dashboard page render in
 * the same server request, so both call sites collapse to one DB round trip.
 * This is the App Router's supported alternative to prop-drilling from a
 * layout, which cannot inject props into its `children`.
 */
export const getImportCount = cache(async (ownerUserId: string): Promise<number> => {
  const db = getDb();
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(imports)
    .where(eq(imports.ownerUserId, ownerUserId));
  return rows[0]?.n ?? 0;
});
