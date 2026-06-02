/**
 * Source of truth for "who can manage Members + run admin backfills".
 * Read from ADMIN_EMAILS env var (comma-separated, lowercased) instead
 * of hard-coding in source — hard-coded list is committed to a public
 * git repo and gives phishing/social-engineering targets the admin's
 * exact email. Env var keeps the value off GitHub.
 *
 * A baked-in fallback is intentionally NOT provided. If the env var is
 * unset, NO user is admin — failing closed is safer than a code
 * fallback that quietly opens the door.
 */
function loadAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

let cached: string[] | null = null;
export function getAdminEmails(): string[] {
  if (cached === null) cached = loadAdminEmails();
  return cached;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.trim().toLowerCase());
}

// Test-only. Reset the cache after mutating process.env in a test.
export function _resetAdminCacheForTests(): void {
  cached = null;
}
