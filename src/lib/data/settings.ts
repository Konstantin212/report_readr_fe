import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { brokerAccounts, userSettings } from "@/lib/db/schema";

export async function getSettings(ownerUserId: string) {
  const db = getDb();
  const [settingsRows, accounts] = await Promise.all([
    db.select().from(userSettings).where(eq(userSettings.ownerUserId, ownerUserId)),
    db.select().from(brokerAccounts).where(eq(brokerAccounts.ownerUserId, ownerUserId)),
  ]);
  return { settings: settingsRows[0] ?? null, accounts };
}
