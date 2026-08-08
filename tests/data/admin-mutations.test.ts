import { eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockSendVerificationEmail, mockRevokeUserSessions } = vi.hoisted(() => ({
  mockSendVerificationEmail: vi.fn(async () => ({})),
  mockRevokeUserSessions: vi.fn(async () => ({})),
}));

vi.mock("@/lib/auth/setup", () => ({
  auth: {
    api: {
      sendVerificationEmail: mockSendVerificationEmail,
      revokeUserSessions: mockRevokeUserSessions,
    },
  },
}));

import { deleteAdminUser, editAdminUser } from "@/lib/data/admin-mutations";
import { getDb } from "@/lib/db/client";
import { adminAuditLog, user } from "@/lib/db/schema";

const RUN_ID = `admin-mutations-test:${Date.now()}:${Math.random().toString(36).slice(2)}`;
const allUserIds: string[] = [];
function uid(suffix: string): string {
  const id = `${RUN_ID}:${suffix}`;
  allUserIds.push(id);
  return id;
}

async function cleanupAll() {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  await db.delete(adminAuditLog).where(inArray(adminAuditLog.targetUserId, allUserIds));
  await db.delete(user).where(inArray(user.id, allUserIds));
}

afterEach(() => {
  mockSendVerificationEmail.mockClear();
  mockRevokeUserSessions.mockClear();
});
afterAll(cleanupAll);

describe("deleteAdminUser (AC-4, real DB integration)", () => {
  beforeEach(cleanupAll);

  it.skipIf(!process.env.DATABASE_URL)("rejects self-delete without touching the row or writing an audit log (AC-4.2)", async () => {
    const db = getDb();
    const adminId = uid("self-delete-admin");
    await db.insert(user).values({ id: adminId, email: `${adminId}@example.com`, emailVerified: true, role: "admin" });

    const result = await deleteAdminUser(db, { id: adminId, email: `${adminId}@example.com` }, adminId);
    expect(result).toEqual({ ok: false, reason: "SELF" });

    const stillThere = await db.select({ id: user.id }).from(user).where(eq(user.id, adminId));
    expect(stillThere).toHaveLength(1);
    const logs = await db.select().from(adminAuditLog).where(eq(adminAuditLog.targetUserId, adminId));
    expect(logs).toHaveLength(0);
  });

  it.skipIf(!process.env.DATABASE_URL)("rejects deleting the last remaining admin (AC-1.4)", async () => {
    const db = getDb();
    const soloAdminId = uid("solo-admin");
    const requestingAdminId = uid("requesting-admin"); // a distinct admin performing the request against a *different* sole admin below
    await db.insert(user).values([
      { id: soloAdminId, email: `${soloAdminId}@example.com`, emailVerified: true, role: "admin" },
    ]);

    const result = await deleteAdminUser(db, { id: requestingAdminId, email: "requester@example.com" }, soloAdminId);
    expect(result).toEqual({ ok: false, reason: "LAST_ADMIN" });

    const stillThere = await db.select({ id: user.id }).from(user).where(eq(user.id, soloAdminId));
    expect(stillThere).toHaveLength(1);
  });

  it.skipIf(!process.env.DATABASE_URL)("reports NOT_FOUND for a nonexistent target", async () => {
    const db = getDb();
    const adminId = uid("admin-notfound-case");
    await db.insert(user).values({ id: adminId, email: `${adminId}@example.com`, emailVerified: true, role: "admin" });

    const result = await deleteAdminUser(db, { id: adminId, email: `${adminId}@example.com` }, "does-not-exist-xyz");
    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it.skipIf(!process.env.DATABASE_URL)("deletes a regular user and writes an ACCOUNT_DELETE audit row (AC-4.3/4.5)", async () => {
    const db = getDb();
    const adminId = uid("deleting-admin");
    const targetId = uid("target-to-delete");
    await db.insert(user).values([
      { id: adminId, email: `${adminId}@example.com`, emailVerified: true, role: "admin" },
      { id: targetId, email: `${targetId}@example.com`, emailVerified: true, role: "user" },
    ]);

    const result = await deleteAdminUser(db, { id: adminId, email: `${adminId}@example.com` }, targetId);
    expect(result).toEqual({ ok: true, auditLogFailed: false });

    const stillThere = await db.select({ id: user.id }).from(user).where(eq(user.id, targetId));
    expect(stillThere).toHaveLength(0);

    const logs = await db.select().from(adminAuditLog).where(eq(adminAuditLog.targetUserId, targetId));
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("ACCOUNT_DELETE");
    expect(logs[0].targetEmailSnapshot).toBe(`${targetId}@example.com`);
  });

  it.skipIf(!process.env.DATABASE_URL)(
    "deletion succeeds even if the audit-log write fails afterward, and reports auditLogFailed: true (AC-4.6 asymmetry, §7.3 step 3)",
    async () => {
      vi.resetModules();
      vi.doMock("@/lib/data/admin-audit-log", () => ({
        writeAuditLog: vi.fn(async () => {
          throw new Error("simulated audit log write failure");
        }),
      }));
      const { deleteAdminUser: deleteAdminUserWithFailingAudit } = await import("@/lib/data/admin-mutations");

      const db = getDb();
      const adminId = uid("delete-audit-fail-admin");
      const targetId = uid("delete-audit-fail-target");
      await db.insert(user).values([
        { id: adminId, email: `${adminId}@example.com`, emailVerified: true, role: "admin" },
        { id: targetId, email: `${targetId}@example.com`, emailVerified: true, role: "user" },
      ]);

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const result = await deleteAdminUserWithFailingAudit(
          db,
          { id: adminId, email: `${adminId}@example.com` },
          targetId,
        );
        expect(result).toEqual({ ok: true, auditLogFailed: true });

        const stillThere = await db.select({ id: user.id }).from(user).where(eq(user.id, targetId));
        expect(stillThere).toHaveLength(0); // deletion committed regardless

        expect(consoleErrorSpy).toHaveBeenCalled();
        const loggedPayload = JSON.parse(consoleErrorSpy.mock.calls[0][0] as string);
        expect(loggedPayload.event).toBe("admin_audit_log_write_failed");
        expect(loggedPayload.action).toBe("ACCOUNT_DELETE");
      } finally {
        consoleErrorSpy.mockRestore();
        vi.doUnmock("@/lib/data/admin-audit-log");
        vi.resetModules();
      }
    },
  );
});

describe("editAdminUser (AC-6, real DB integration)", () => {
  beforeEach(cleanupAll);

  it.skipIf(!process.env.DATABASE_URL)("updates name with a plain UPDATE and logs before/after", async () => {
    const db = getDb();
    const adminId = uid("edit-admin-name");
    const targetId = uid("edit-target-name");
    await db.insert(user).values([
      { id: adminId, email: `${adminId}@example.com`, emailVerified: true, role: "admin" },
      { id: targetId, email: `${targetId}@example.com`, name: "Old Name", emailVerified: true, role: "user" },
    ]);

    const result = await editAdminUser(db, { id: adminId, email: `${adminId}@example.com` }, targetId, {
      name: "New Name",
    });
    expect(result).toEqual({ ok: true, auditLogFailed: false });

    const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, targetId));
    expect(row.name).toBe("New Name");

    const logs = await db.select().from(adminAuditLog).where(eq(adminAuditLog.targetUserId, targetId));
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe("ACCOUNT_EDIT");
    expect((logs[0].detail as { before: { name: string }; after: { name: string } }).before.name).toBe("Old Name");
    expect((logs[0].detail as { before: { name: string }; after: { name: string } }).after.name).toBe("New Name");
    expect(mockSendVerificationEmail).not.toHaveBeenCalled();
    expect(mockRevokeUserSessions).not.toHaveBeenCalled();
  });

  it.skipIf(!process.env.DATABASE_URL)(
    "is a no-op (no audit row) when the body doesn't actually change anything",
    async () => {
      const db = getDb();
      const adminId = uid("edit-admin-noop");
      const targetId = uid("edit-target-noop");
      await db.insert(user).values([
        { id: adminId, email: `${adminId}@example.com`, emailVerified: true, role: "admin" },
        { id: targetId, email: `${targetId}@example.com`, name: "Same", emailVerified: true, role: "user" },
      ]);

      const result = await editAdminUser(db, { id: adminId, email: `${adminId}@example.com` }, targetId, {
        name: "Same",
      });
      expect(result).toEqual({ ok: true, auditLogFailed: false });

      const logs = await db.select().from(adminAuditLog).where(eq(adminAuditLog.targetUserId, targetId));
      expect(logs).toHaveLength(0);
    },
  );

  it.skipIf(!process.env.DATABASE_URL)(
    "email change sets emailVerified false, sends a verification email, and revokes the target's sessions (AC-6.2)",
    async () => {
      const db = getDb();
      const adminId = uid("edit-admin-email");
      const targetId = uid("edit-target-email");
      await db.insert(user).values([
        { id: adminId, email: `${adminId}@example.com`, emailVerified: true, role: "admin" },
        { id: targetId, email: `${targetId}@example.com`, emailVerified: true, role: "user" },
      ]);

      const newEmail = `${targetId}-new@example.com`;
      const result = await editAdminUser(db, { id: adminId, email: `${adminId}@example.com` }, targetId, {
        email: newEmail,
      });
      expect(result).toEqual({ ok: true, auditLogFailed: false });

      const [row] = await db.select({ email: user.email, emailVerified: user.emailVerified }).from(user).where(eq(user.id, targetId));
      expect(row.email).toBe(newEmail);
      expect(row.emailVerified).toBe(false);

      expect(mockSendVerificationEmail).toHaveBeenCalledWith({ body: { email: newEmail } });
      expect(mockRevokeUserSessions).toHaveBeenCalledWith({ body: { userId: targetId } });
    },
  );

  it.skipIf(!process.env.DATABASE_URL)(
    "reports EMAIL_TAKEN instead of throwing when the new email is already used by another account",
    async () => {
      const db = getDb();
      const adminId = uid("edit-admin-email-conflict");
      const targetId = uid("edit-target-email-conflict");
      const otherId = uid("edit-other-email-conflict");
      const takenEmail = `${otherId}@example.com`;
      await db.insert(user).values([
        { id: adminId, email: `${adminId}@example.com`, emailVerified: true, role: "admin" },
        { id: targetId, email: `${targetId}@example.com`, emailVerified: true, role: "user" },
        { id: otherId, email: takenEmail, emailVerified: true, role: "user" },
      ]);

      await expect(
        editAdminUser(db, { id: adminId, email: `${adminId}@example.com` }, targetId, { email: takenEmail }),
      ).resolves.toEqual({ ok: false, reason: "EMAIL_TAKEN" });

      const [row] = await db
        .select({ email: user.email, emailVerified: user.emailVerified })
        .from(user)
        .where(eq(user.id, targetId));
      expect(row.email).toBe(`${targetId}@example.com`);
      expect(row.emailVerified).toBe(true);

      expect(mockSendVerificationEmail).not.toHaveBeenCalled();
      expect(mockRevokeUserSessions).not.toHaveBeenCalled();
    },
  );

  it.skipIf(!process.env.DATABASE_URL)(
    "rejects demoting the last remaining admin (AC-1.4/AC-6.3), leaving the role untouched",
    async () => {
      const db = getDb();
      const adminId = uid("edit-admin-demote-requester");
      const soloAdminId = uid("edit-admin-demote-target");
      await db.insert(user).values([
        { id: adminId, email: `${adminId}@example.com`, emailVerified: true, role: "admin" },
        { id: soloAdminId, email: `${soloAdminId}@example.com`, emailVerified: true, role: "admin" },
      ]);
      // adminId and soloAdminId are the only two admins; demote adminId
      // first so soloAdminId becomes the last remaining admin, then try
      // to demote soloAdminId too.
      await editAdminUser(db, { id: adminId, email: `${adminId}@example.com` }, adminId, { role: "user" });

      const result = await editAdminUser(
        db,
        { id: adminId, email: `${adminId}@example.com` },
        soloAdminId,
        { role: "user" },
      );
      expect(result).toEqual({ ok: false, reason: "LAST_ADMIN" });

      const [row] = await db.select({ role: user.role }).from(user).where(eq(user.id, soloAdminId));
      expect(row.role).toBe("admin");
    },
  );

  it.skipIf(!process.env.DATABASE_URL)("allows promoting a user to admin with no last-admin guard involved", async () => {
    const db = getDb();
    const adminId = uid("edit-admin-promote-requester");
    const targetId = uid("edit-target-promote");
    await db.insert(user).values([
      { id: adminId, email: `${adminId}@example.com`, emailVerified: true, role: "admin" },
      { id: targetId, email: `${targetId}@example.com`, emailVerified: true, role: "user" },
    ]);

    const result = await editAdminUser(db, { id: adminId, email: `${adminId}@example.com` }, targetId, {
      role: "admin",
    });
    expect(result).toEqual({ ok: true, auditLogFailed: false });

    const [row] = await db.select({ role: user.role }).from(user).where(eq(user.id, targetId));
    expect(row.role).toBe("admin");
  });

  it.skipIf(!process.env.DATABASE_URL)("reports NOT_FOUND for a nonexistent target", async () => {
    const db = getDb();
    const adminId = uid("edit-admin-notfound");
    await db.insert(user).values({ id: adminId, email: `${adminId}@example.com`, emailVerified: true, role: "admin" });

    const result = await editAdminUser(db, { id: adminId, email: `${adminId}@example.com` }, "does-not-exist-xyz", {
      name: "X",
    });
    expect(result).toEqual({ ok: false, reason: "NOT_FOUND" });
  });
});
