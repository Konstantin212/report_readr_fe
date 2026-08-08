import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { writeAuditLog } from "@/lib/data/admin-audit-log";
import { getDb } from "@/lib/db/client";
import { adminAuditLog, user } from "@/lib/db/schema";

/**
 * Structural test (no DB required): proves the insert builds the exact
 * shape/columns the design doc §3.4 requires, in particular that
 * `detail`/`relatedActionId` default to NULL when omitted (never
 * `undefined`, which some drivers would silently coerce differently) and
 * that no extra columns (IP address, session token, free-text notes —
 * gdpr-compliance data-minimization requirement) are ever written.
 */
describe("writeAuditLog (structural — no DB required)", () => {
  it("builds an INSERT into admin_audit_log with exactly the minimized column set", () => {
    const db = getDb();
    const query = db.insert(adminAuditLog).values({
      action: "ACCOUNT_EDIT",
      adminUserId: "admin-1",
      adminEmailSnapshot: "admin@example.com",
      targetUserId: "target-1",
      targetEmailSnapshot: "target@example.com",
      detail: null,
      relatedActionId: null,
    });
    const { sql: text, params } = query.toSQL();

    expect(text).toContain('insert into "admin_audit_log"');
    for (const col of ["action", "admin_user_id", "admin_email_snapshot", "target_user_id", "target_email_snapshot", "detail", "related_action_id"]) {
      expect(text).toContain(`"${col}"`);
    }
    // Data minimization: no IP/session/notes columns exist on the table at all.
    expect(text).not.toMatch(/ip_address|session_token|note/);
    expect(params).toContain("ACCOUNT_EDIT");
    expect(params).toContain("admin@example.com");
    expect(params).toContain("target@example.com");
  });
});

/**
 * Real-DB integration test, following this repo's existing convention
 * (tests/api/cron/auth-cleanup.test.ts): gated on
 * `it.skipIf(!process.env.DATABASE_URL)`.
 */
const RUN_ID = `admin-audit-log-test:${Date.now()}:${Math.random().toString(36).slice(2)}`;
const allUserIds: string[] = [];
const allAuditLogIds: string[] = [];
function uid(suffix: string): string {
  const id = `${RUN_ID}:${suffix}`;
  allUserIds.push(id);
  return id;
}

async function cleanupAll() {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  await db.delete(adminAuditLog).where(inArray(adminAuditLog.id, allAuditLogIds));
  await db.delete(user).where(inArray(user.id, allUserIds));
}

afterAll(cleanupAll);

describe("writeAuditLog (real DB integration)", () => {
  it.skipIf(!process.env.DATABASE_URL)(
    "writes a durable, append-only row and returns its id for relatedActionId linking",
    async () => {
      const db = getDb();
      const adminId = uid("admin");
      const targetId = uid("target");

      try {
        await db.insert(user).values([
          { id: adminId, email: `${adminId}@example.com`, emailVerified: true, role: "admin" },
          { id: targetId, email: `${targetId}@example.com`, emailVerified: true, role: "user" },
        ]);

        const start = await writeAuditLog({
          action: "IMPERSONATION_START",
          adminUserId: adminId,
          adminEmailSnapshot: `${adminId}@example.com`,
          targetUserId: targetId,
          targetEmailSnapshot: `${targetId}@example.com`,
          detail: { plannedExpiresAt: "2026-08-08T12:00:00Z" },
        });
        allAuditLogIds.push(start.id);
        expect(start.id).toBeTruthy();

        const end = await writeAuditLog({
          action: "IMPERSONATION_END",
          adminUserId: adminId,
          adminEmailSnapshot: `${adminId}@example.com`,
          targetUserId: targetId,
          targetEmailSnapshot: `${targetId}@example.com`,
          detail: { endReason: "EXITED" },
          relatedActionId: start.id,
        });
        allAuditLogIds.push(end.id);

        const rows = await db.select().from(adminAuditLog).where(eq(adminAuditLog.relatedActionId, start.id));
        expect(rows).toHaveLength(1);
        expect(rows[0].id).toBe(end.id);
        expect(rows[0].action).toBe("IMPERSONATION_END");

        // Survives target account deletion — targetUserId is deliberately
        // not an FK (design doc §3.4).
        await db.delete(user).where(eq(user.id, targetId));
        const stillThere = await db.select().from(adminAuditLog).where(eq(adminAuditLog.id, start.id));
        expect(stillThere).toHaveLength(1);
        expect(stillThere[0].targetEmailSnapshot).toBe(`${targetId}@example.com`);
      } finally {
        await cleanupAll();
      }
    },
  );

  it.skipIf(!process.env.DATABASE_URL)(
    "survives deletion of the admin's own account (adminUserId FK is ON DELETE SET NULL)",
    async () => {
      const db = getDb();
      const adminId = uid("admin-deleted");
      const targetId = uid("target-2");

      try {
        await db.insert(user).values([
          { id: adminId, email: `${adminId}@example.com`, emailVerified: true, role: "admin" },
          { id: targetId, email: `${targetId}@example.com`, emailVerified: true, role: "user" },
        ]);

        const row = await writeAuditLog({
          action: "ACCOUNT_EDIT",
          adminUserId: adminId,
          adminEmailSnapshot: `${adminId}@example.com`,
          targetUserId: targetId,
          targetEmailSnapshot: `${targetId}@example.com`,
          detail: { before: { name: "Old" }, after: { name: "New" } },
        });
        allAuditLogIds.push(row.id);

        await db.delete(user).where(eq(user.id, adminId));

        const stillThere = await db.select().from(adminAuditLog).where(eq(adminAuditLog.id, row.id));
        expect(stillThere).toHaveLength(1);
        expect(stillThere[0].adminUserId).toBeNull();
        expect(stillThere[0].adminEmailSnapshot).toBe(`${adminId}@example.com`);
      } finally {
        await cleanupAll();
      }
    },
  );
});
