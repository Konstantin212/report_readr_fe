import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { allowedEmails } from "@/lib/db/schema";

export function parseAuthorizedEmails(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailAuthorized(email: string | undefined, allowlist: string[]): boolean {
  if (!email) {
    return false;
  }

  return allowlist.includes(email.trim().toLowerCase());
}

export function getAuthorizedEmails(): string[] {
  return parseAuthorizedEmails(process.env.AUTHORIZED_EMAILS);
}

/**
 * The full effective allowlist = DB rows ∪ AUTHORIZED_EMAILS env var.
 * The env var is kept as a bootstrap fallback so the workspace owner is
 * never locked out even if the DB row is missing or the DB is empty.
 * Day-to-day invitations land in the DB via the Settings → Members UI.
 */
export async function isEmailAllowedToSignIn(email: string | undefined): Promise<boolean> {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (isEmailAuthorized(normalized, getAuthorizedEmails())) return true;
  // Single-row lookup keyed on the unique index — cheap even on Neon HTTP.
  const rows = await getDb()
    .select({ id: allowedEmails.id })
    .from(allowedEmails)
    .where(eq(allowedEmails.email, normalized))
    .limit(1);
  return rows.length > 0;
}
