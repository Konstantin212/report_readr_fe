import { inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import {
  ADMIN_USERS_PAGE_SIZE,
  buildAdminUserListQuery,
  getAdminUserDetail,
  listAdminUsers,
} from "@/lib/data/admin-users";
import { getDb } from "@/lib/db/client";
import { imports, user } from "@/lib/db/schema";

/**
 * Structural test (no DB required — mirrors
 * tests/api/cron/auth-cleanup-predicate.test.ts's `.toSQL()` pattern):
 * AC-3.3's "did upload something" signal must be scoped strictly to the
 * `imports` table (not cryptoAccounts), AC-3.4 requires pagination +
 * most-recent-first default sort.
 */
describe("buildAdminUserListQuery (structural — no DB required)", () => {
  it("orders by createdAt DESC, limits to a page, and scopes the upload signal to imports only", () => {
    const db = getDb();
    const query = buildAdminUserListQuery(db, 1);
    const { sql: text, params } = query.toSQL();

    expect(text).toMatch(/order by "user"\."created_at" desc/i);
    expect(text).toMatch(/limit \$\d+/i);
    expect(text.toLowerCase()).toContain("exists");
    expect(text).toContain('"imports"');
    expect(text).not.toContain("crypto_accounts");
    expect(params).toContain(ADMIN_USERS_PAGE_SIZE);
  });

  it("page 1 has zero offset (drizzle omits an explicit `offset 0` clause); page 2 offsets by exactly one page size", () => {
    const db = getDb();
    const page1 = buildAdminUserListQuery(db, 1).toSQL();
    const page2 = buildAdminUserListQuery(db, 2).toSQL();

    expect(page1.sql).not.toMatch(/offset/i);
    expect(page2.sql).toMatch(/offset \$\d+/i);
    expect(page2.params).toContain(ADMIN_USERS_PAGE_SIZE);
    // Both the limit and the offset equal the page size on page 2 —
    // confirm there are two distinct $N-bound params, not one reused.
    expect(page2.params.filter((p) => p === ADMIN_USERS_PAGE_SIZE)).toHaveLength(2);
  });

  it("clamps a non-positive or non-finite page to page 1 (no offset clause)", () => {
    const db = getDb();
    const zero = buildAdminUserListQuery(db, 0).toSQL();
    const negative = buildAdminUserListQuery(db, -5).toSQL();
    const nan = buildAdminUserListQuery(db, Number.NaN).toSQL();
    for (const q of [zero, negative, nan]) {
      expect(q.sql).not.toMatch(/offset/i);
    }
  });
});

/**
 * Real-DB integration test, following this repo's existing convention:
 * gated on `it.skipIf(!process.env.DATABASE_URL)`.
 */
const RUN_ID = `admin-users-test:${Date.now()}:${Math.random().toString(36).slice(2)}`;
const allUserIds: string[] = [];
function uid(suffix: string): string {
  const id = `${RUN_ID}:${suffix}`;
  allUserIds.push(id);
  return id;
}

async function cleanupAll() {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  await db.delete(imports).where(inArray(imports.ownerUserId, allUserIds));
  await db.delete(user).where(inArray(user.id, allUserIds));
}

afterAll(cleanupAll);

describe("listAdminUsers / getAdminUserDetail (real DB integration)", () => {
  it.skipIf(!process.env.DATABASE_URL)(
    "reports hasUploaded accurately per user and includes every currently-existing account",
    async () => {
      const db = getDb();
      const uploaderId = uid("uploader");
      const noUploadId = uid("no-upload");

      try {
        await db.insert(user).values([
          { id: uploaderId, email: `${uploaderId}@example.com`, emailVerified: true, role: "user" },
          { id: noUploadId, email: `${noUploadId}@example.com`, emailVerified: true, role: "user" },
        ]);
        await db.insert(imports).values({
          ownerUserId: uploaderId,
          broker: "INTERACTIVE_BROKERS",
          fileName: "statement.csv",
          fileHash: `${uploaderId}-hash`,
          taxYear: 2025,
          eventCount: 1,
        });

        const { rows } = await listAdminUsers(1);
        const uploaderRow = rows.find((r) => r.id === uploaderId);
        const noUploadRow = rows.find((r) => r.id === noUploadId);
        expect(uploaderRow?.hasUploaded).toBe(true);
        expect(noUploadRow?.hasUploaded).toBe(false);

        const detail = await getAdminUserDetail(uploaderId);
        expect(detail?.hasUploaded).toBe(true);
        expect(detail?.email).toBe(`${uploaderId}@example.com`);

        const missing = await getAdminUserDetail("does-not-exist-xyz");
        expect(missing).toBeNull();
      } finally {
        await cleanupAll();
      }
    },
  );
});
