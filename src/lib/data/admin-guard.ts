import { and, eq, exists, isNull, ne, or } from "drizzle-orm";

import type { Db } from "@/lib/auth/auth-cleanup";
import { user } from "@/lib/db/schema";

/**
 * AC-1.4 / AC-4 (delete) / AC-6.3 (edit) — "at least one admin must
 * always exist" — expressed as a single atomic SQL condition, not a
 * separate SELECT-then-check. This DB driver (drizzle-orm/neon-http) has
 * no transaction support (see auth-cleanup.ts's doc-comment on the same
 * constraint), so the guard must be baked directly into the DELETE's or
 * UPDATE's own `WHERE` clause — combine with `eq(user.id, targetUserId)`
 * there (admin-panel design doc §7.2/§9.3).
 *
 * Resolves to true (guard passes, action allowed to proceed) when EITHER:
 *  - the target isn't currently an admin (nothing to protect — covers
 *    NULL role explicitly, since `role != 'admin'` alone is NULL, not
 *    true, for a NULL role in SQL three-valued logic), OR
 *  - the target is an admin, but at least one OTHER admin still exists.
 *
 * Resolves to false — 0 rows affected by the DELETE/UPDATE — only when
 * the target is the last remaining admin. The caller MUST treat 0
 * affected rows as "the guard rejected it" and return a 4xx with a
 * specific reason, never silently succeed against a stale local read
 * (the residual two-concurrent-demotions race is an accepted non-issue
 * at this app's scale — same judgment call auth-cleanup.ts implicitly
 * makes).
 */
export function lastAdminGuardCondition(db: Db, targetUserId: string) {
  const otherAdminExists = db
    .select({ x: user.id })
    .from(user)
    .where(and(eq(user.role, "admin"), ne(user.id, targetUserId)));

  return or(isNull(user.role), ne(user.role, "admin"), exists(otherAdminExists));
}
