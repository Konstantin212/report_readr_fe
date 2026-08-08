import { count, desc, eq, exists } from "drizzle-orm";

import type { Db } from "@/lib/auth/auth-cleanup";
import { getDb } from "@/lib/db/client";
import { imports, user } from "@/lib/db/schema";

export type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
  role: string | null;
  /** True iff at least one `imports` row exists for this user (AC-3.3) —
   *  scoped strictly to `imports` rows per the AC doc's literal wording;
   *  Coinbase (`cryptoAccounts`) connections don't count. */
  hasUploaded: boolean;
};

/** AC-3.4: offset pagination, page size ~50, default sort createdAt DESC. */
export const ADMIN_USERS_PAGE_SIZE = 50;

const adminUserColumns = (db: Db) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  createdAt: user.createdAt,
  role: user.role,
  hasUploaded: exists(db.select({ x: imports.id }).from(imports).where(eq(imports.ownerUserId, user.id))).mapWith(
    Boolean,
  ),
});

/**
 * Query-builder-only (not awaited) so tests can call `.toSQL()` on the
 * result without a live DB connection — mirrors
 * abandonedCandidatePredicate(db) in auth-cleanup.ts.
 */
export function buildAdminUserListQuery(db: Db, page: number) {
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const offset = (safePage - 1) * ADMIN_USERS_PAGE_SIZE;
  return db
    .select(adminUserColumns(db))
    .from(user)
    .orderBy(desc(user.createdAt))
    .limit(ADMIN_USERS_PAGE_SIZE)
    .offset(offset);
}

export type AdminUserListResult = {
  rows: AdminUserRow[];
  page: number;
  pageSize: number;
  totalCount: number;
};

/** AC-3: paginated user list — every currently-existing account, most-recent signup first. */
export async function listAdminUsers(page = 1): Promise<AdminUserListResult> {
  const db = getDb();
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;

  const [rows, totalRows] = await Promise.all([
    buildAdminUserListQuery(db, safePage),
    db.select({ c: count() }).from(user),
  ]);

  return {
    rows,
    page: safePage,
    pageSize: ADMIN_USERS_PAGE_SIZE,
    totalCount: totalRows[0]?.c ?? 0,
  };
}

/** AC-3.5: single-user detail view, entry point for edit/delete/impersonate. */
export async function getAdminUserDetail(id: string): Promise<AdminUserRow | null> {
  const db = getDb();
  const rows = await db
    .select(adminUserColumns(db))
    .from(user)
    .where(eq(user.id, id))
    .limit(1);

  return rows[0] ?? null;
}
