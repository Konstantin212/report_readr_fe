import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { lastAdminGuardCondition } from "@/lib/data/admin-guard";
import { getDb } from "@/lib/db/client";
import { user } from "@/lib/db/schema";

/**
 * Structural regression test (no DB required — mirrors
 * tests/api/cron/auth-cleanup-predicate.test.ts's `.toSQL()` pattern):
 * proves the guard's SQL *shape* references the admin_action's role
 * column and an EXISTS/COUNT-style subquery excluding the target row,
 * not that it behaves correctly against real data (see the real-DB
 * integration test below for that).
 */
describe("lastAdminGuardCondition (structural — no DB required)", () => {
  it("builds a condition referencing role and excluding the target id from the 'other admin' check", () => {
    const db = getDb();
    const targetId = "target-user-id";
    const query = db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, targetId), lastAdminGuardCondition(db, targetId)));
    const { sql: text, params } = query.toSQL();

    expect(text).toContain('"user"."role"');
    expect(text.toLowerCase()).toContain("exists");
    expect(params).toContain(targetId);
    expect(params).toContain("admin");
  });
});

/**
 * Real-DB integration test, following this repo's existing convention
 * (tests/api/cron/auth-cleanup.test.ts): gated on
 * `it.skipIf(!process.env.DATABASE_URL)`.
 */
const RUN_ID = `admin-guard-test:${Date.now()}:${Math.random().toString(36).slice(2)}`;
const allUserIds: string[] = [];
function uid(suffix: string): string {
  const id = `${RUN_ID}:${suffix}`;
  allUserIds.push(id);
  return id;
}

async function cleanupAll() {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  await db.delete(user).where(inArray(user.id, allUserIds));
}

afterAll(cleanupAll);

describe("lastAdminGuardCondition (real DB integration)", () => {
  it.skipIf(!process.env.DATABASE_URL)(
    "blocks demoting/deleting the last remaining admin, but allows it when another admin exists",
    async () => {
      const db = getDb();
      const soleAdminId = uid("sole-admin");
      const secondAdminId = uid("second-admin");
      const regularUserId = uid("regular-user");

      try {
        await db.insert(user).values([
          { id: soleAdminId, email: `${soleAdminId}@example.com`, emailVerified: true, role: "admin" },
          { id: regularUserId, email: `${regularUserId}@example.com`, emailVerified: true, role: "user" },
        ]);

        // Deleting a regular user is never guarded — always allowed.
        const regularDelete = await db
          .delete(user)
          .where(and(eq(user.id, regularUserId), lastAdminGuardCondition(db, regularUserId)))
          .returning({ id: user.id });
        expect(regularDelete).toHaveLength(1);

        // Deleting the sole admin must be blocked (0 rows affected).
        const soleAdminDelete = await db
          .delete(user)
          .where(and(eq(user.id, soleAdminId), lastAdminGuardCondition(db, soleAdminId)))
          .returning({ id: user.id });
        expect(soleAdminDelete).toHaveLength(0);

        // Confirm the sole admin is still there.
        const stillThere = await db.select({ id: user.id }).from(user).where(eq(user.id, soleAdminId));
        expect(stillThere).toHaveLength(1);

        // Add a second admin — now deleting the first admin must succeed.
        await db.insert(user).values({
          id: secondAdminId,
          email: `${secondAdminId}@example.com`,
          emailVerified: true,
          role: "admin",
        });
        const nowAllowed = await db
          .delete(user)
          .where(and(eq(user.id, soleAdminId), lastAdminGuardCondition(db, soleAdminId)))
          .returning({ id: user.id });
        expect(nowAllowed).toHaveLength(1);
      } finally {
        await cleanupAll();
      }
    },
  );

  it.skipIf(!process.env.DATABASE_URL)(
    "never blocks an action on a user whose role is NULL (default-deny — nothing to protect)",
    async () => {
      const db = getDb();
      const nullRoleId = uid("null-role");
      try {
        await db.insert(user).values({ id: nullRoleId, email: `${nullRoleId}@example.com`, emailVerified: true });
        const deleted = await db
          .delete(user)
          .where(and(eq(user.id, nullRoleId), lastAdminGuardCondition(db, nullRoleId)))
          .returning({ id: user.id });
        expect(deleted).toHaveLength(1);
      } finally {
        await cleanupAll();
      }
    },
  );
});
