/**
 * Single source of truth for "who can manage Members on the Settings
 * page". Hard-coded to the workspace owner's email so a compromised
 * member account can't add their friends to the allowlist.
 *
 * To transfer ownership later, edit this list. There's no UI for it —
 * intentional. If we ever go multi-workspace this becomes a per-row
 * flag on the user table; not now.
 */
export const ADMIN_EMAILS: readonly string[] = ["prikhodko99@gmail.com"];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}
