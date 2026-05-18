import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { brokerAccounts, userSettings } from "@/lib/db/schema";

export async function getSettings(ownerUserId: string) {
  const db = getDb();
  const settings = (await db.select().from(userSettings).where(eq(userSettings.ownerUserId, ownerUserId)))[0]
    ?? null;
  const accounts = await db.select().from(brokerAccounts).where(eq(brokerAccounts.ownerUserId, ownerUserId));
  return { settings, accounts };
}
