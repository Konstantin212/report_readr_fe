import { and, eq, sql } from "drizzle-orm";

import type { Db } from "@/lib/auth/auth-cleanup";
import { auth } from "@/lib/auth/setup";
import { user } from "@/lib/db/schema";

import { writeAuditLog } from "./admin-audit-log";
import { lastAdminGuardCondition } from "./admin-guard";

export type AdminActor = { id: string; email: string };

export type DeleteUserResult =
  | { ok: true; auditLogFailed: boolean }
  | { ok: false; reason: "SELF" | "LAST_ADMIN" | "NOT_FOUND" };

/**
 * AC-4: account deletion, following the exact ordering the design doc
 * mandates given `drizzle-orm/neon-http` has no transaction support
 * (§7.3):
 *   1. Delete first, atomically, with the last-admin guard baked into
 *      the `WHERE` clause (§7.2) — 0 rows returned means either the
 *      target didn't exist or the guard rejected it; nothing is logged
 *      in that case because nothing happened (AC-4.6).
 *   2. Then write the audit row. If step 2 throws, the deletion has
 *      already committed — catch it, log a structured line so there's
 *      *some* trail, and still report success for the deletion itself,
 *      but flag `auditLogFailed: true` so the caller isn't told
 *      everything is silently clean (AC-4.6's "not silently partial").
 */
export async function deleteAdminUser(db: Db, admin: AdminActor, targetId: string): Promise<DeleteUserResult> {
  if (targetId === admin.id) {
    return { ok: false, reason: "SELF" }; // AC-4.2
  }

  const [deleted] = await db
    .delete(user)
    .where(and(eq(user.id, targetId), lastAdminGuardCondition(db, targetId)))
    .returning({ id: user.id, email: user.email });

  if (!deleted) {
    // The single guarded DELETE can't itself distinguish "didn't exist"
    // from "guard rejected it" — a fast, non-atomic follow-up read to
    // give the admin a precise reason. Doesn't weaken the guard: the
    // DELETE already ran atomically with zero effect either way.
    const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.id, targetId)).limit(1);
    return { ok: false, reason: existing ? "LAST_ADMIN" : "NOT_FOUND" };
  }

  let auditLogFailed = false;
  try {
    await writeAuditLog({
      action: "ACCOUNT_DELETE",
      adminUserId: admin.id,
      adminEmailSnapshot: admin.email,
      targetUserId: deleted.id,
      targetEmailSnapshot: deleted.email,
    });
  } catch (err) {
    auditLogFailed = true;
    // Structured durable trail (matches auth-cleanup.ts's convention); Vercel captures console output.
    console.error(
      JSON.stringify({
        event: "admin_audit_log_write_failed",
        action: "ACCOUNT_DELETE",
        targetUserId: deleted.id,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  return { ok: true, auditLogFailed };
}

export type EditUserBody = {
  name?: string;
  email?: string;
  role?: "admin" | "user";
};

export type EditUserResult =
  | { ok: true; auditLogFailed: boolean }
  | { ok: false; reason: "NOT_FOUND" | "LAST_ADMIN" | "EMAIL_TAKEN" };

/**
 * AC-6: edit account. `name`/`email`/`role` are the only editable
 * fields (§9) — the caller (route handler) is responsible for rejecting
 * any other field/shape before this is ever called.
 */
export async function editAdminUser(
  db: Db,
  admin: AdminActor,
  targetId: string,
  body: EditUserBody,
): Promise<EditUserResult> {
  const [before] = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role })
    .from(user)
    .where(eq(user.id, targetId))
    .limit(1);

  if (!before) {
    return { ok: false, reason: "NOT_FOUND" };
  }

  const updates: Partial<{ name: string; email: string; emailVerified: boolean; role: string }> = {};
  const after: { name?: string; email?: string; role?: string } = {};

  if (body.name !== undefined && body.name !== before.name) {
    updates.name = body.name;
    after.name = body.name;
  }

  const emailChanged = body.email !== undefined && body.email !== before.email;
  if (emailChanged) {
    updates.email = body.email;
    updates.emailVerified = false; // AC-6.2: admin-set-and-untrusted, not admin-set-and-trust
    after.email = body.email;
  }

  const isDemotion = body.role !== undefined && before.role === "admin" && body.role !== "admin";
  if (body.role !== undefined && body.role !== before.role) {
    updates.role = body.role;
    after.role = body.role;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: true, auditLogFailed: false }; // no-op edit — nothing changed, nothing to log
  }

  // Same atomic last-admin guard as deletion (§9.3), only applied when
  // this specific edit is a demotion away from "admin".
  const whereCondition = isDemotion
    ? and(
        eq(user.id, targetId),
        sql`(SELECT count(*) FROM "user" WHERE role = 'admin' AND id != ${targetId}) > 0`,
      )
    : eq(user.id, targetId);

  let updated: { id: string } | undefined;
  try {
    [updated] = await db.update(user).set(updates).where(whereCondition).returning({ id: user.id });
  } catch (err) {
    // Postgres unique_violation (23505). Only the email column is
    // unique among the editable fields here, so — same posture as the
    // NOT_FOUND/LAST_ADMIN branches below — surface this as a typed,
    // expected failure rather than letting the raw DB error bubble up
    // to the route as an uncaught 500.
    if (emailChanged && (err as { code?: string } | undefined)?.code === "23505") {
      return { ok: false, reason: "EMAIL_TAKEN" };
    }
    throw err;
  }

  if (!updated) {
    return { ok: false, reason: "LAST_ADMIN" };
  }

  if (emailChanged && body.email) {
    // §9.2 steps 2-3: real verification link for the new address, then
    // kill any stale session signed in under the old identity — same
    // "security-sensitive change -> revoke other sessions" posture as
    // revokeSessionsOnPasswordReset in setup.ts.
    await auth.api.sendVerificationEmail({ body: { email: body.email } });
    await auth.api.revokeUserSessions({ body: { userId: targetId } });
  }

  let auditLogFailed = false;
  try {
    await writeAuditLog({
      action: "ACCOUNT_EDIT",
      adminUserId: admin.id,
      adminEmailSnapshot: admin.email,
      targetUserId: targetId,
      targetEmailSnapshot: emailChanged && body.email ? body.email : before.email,
      detail: {
        before: { name: before.name, email: before.email, role: before.role },
        after,
      },
    });
  } catch (err) {
    auditLogFailed = true;
    // Structured durable trail, same convention as deleteAdminUser above.
    console.error(
      JSON.stringify({
        event: "admin_audit_log_write_failed",
        action: "ACCOUNT_EDIT",
        targetUserId: targetId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  return { ok: true, auditLogFailed };
}
