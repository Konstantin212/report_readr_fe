import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/setup";
import { writeAuditLog } from "@/lib/data/admin-audit-log";
import { getDb } from "@/lib/db/client";
import { adminAuditLog, user } from "@/lib/db/schema";

/**
 * AC-5.4: explicit impersonation exit (design doc §8.4).
 *
 * Deliberately does NOT call requireAdminApi() here: during
 * impersonation the caller's `session.user.role` IS the target's, not
 * "admin" (see require-admin.ts), so the normal admin guard would
 * itself reject this call. Guards instead on
 * `session.session.impersonatedBy` being truthy — the AC-2.5 route-
 * coverage test (tests/admin/route-guard-coverage.test.ts) special-cases
 * this one file for exactly that reason.
 */
export async function POST() {
  const hdrs = await headers();
  const session = await auth.api.getSession({ headers: hdrs });

  const impersonatedByAdminId = session?.session?.impersonatedBy;
  if (!impersonatedByAdminId || !session) {
    return NextResponse.json({ error: "NOT_IMPERSONATING" }, { status: 400 });
  }

  const targetId = session.user.id;
  const targetEmail = session.user.email;

  let pluginResponse: Response;
  try {
    pluginResponse = await auth.api.stopImpersonating({ headers: hdrs, asResponse: true });
  } catch (err) {
    return NextResponse.json(
      { error: "STOP_IMPERSONATION_FAILED", message: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const db = getDb();

  // adminEmailSnapshot needs a fresh lookup here — the START row already
  // captured it once, but this END row is written from the target's
  // still-active (about-to-be-swapped-back) session, which has no
  // knowledge of the admin's email at all.
  const [adminRow] = await db.select({ email: user.email }).from(user).where(eq(user.id, impersonatedByAdminId)).limit(1);

  // Best-effort link back to the matching START row (design doc §8.4):
  // most recent IMPERSONATION_START for this admin+target pair. The
  // residual race between two concurrent stops of the same session is
  // an accepted non-issue at this app's scale (same judgment call as
  // the last-admin guard's TOCTOU window).
  const [matchingStart] = await db
    .select({ id: adminAuditLog.id })
    .from(adminAuditLog)
    .where(
      and(
        eq(adminAuditLog.action, "IMPERSONATION_START"),
        eq(adminAuditLog.adminUserId, impersonatedByAdminId),
        eq(adminAuditLog.targetUserId, targetId),
      ),
    )
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(1);

  await writeAuditLog({
    action: "IMPERSONATION_END",
    adminUserId: impersonatedByAdminId,
    adminEmailSnapshot: adminRow?.email ?? "unknown",
    targetUserId: targetId,
    targetEmailSnapshot: targetEmail,
    detail: { endReason: "EXITED" },
    relatedActionId: matchingStart?.id ?? null,
  });

  const out = NextResponse.json({ ok: true }, { status: 200 });
  pluginResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") out.headers.append(key, value);
  });
  return out;
}
