import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/require-admin";
import { auth } from "@/lib/auth/setup";
import { writeAuditLog } from "@/lib/data/admin-audit-log";
import { getDb } from "@/lib/db/client";
import { user } from "@/lib/db/schema";

/**
 * AC-5.1: start impersonating a target user (design doc §8.1).
 *
 * 1. requireAdminApi() — the enforced boundary (AC-2.5).
 * 2. Reject self-impersonation (AC-5.7).
 * 3. Write the IMPERSONATION_START audit row FIRST this time — ordering
 *    is flipped relative to deletion because starting impersonation
 *    isn't itself destructive/irreversible, so logging-then-acting gives
 *    a durable record even if the subsequent plugin call fails. Its id
 *    becomes `relatedActionId` for the eventual IMPERSONATION_END row.
 * 4. Delegate the actual session-cookie swap to better-auth's own
 *    `impersonateUser` endpoint (asResponse: true so its Set-Cookie
 *    headers — session swap + admin_session stash — reach the browser).
 *    `allowImpersonatingAdmins: false` (setup.ts) means the plugin
 *    itself refuses to impersonate another admin.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  if (admin instanceof NextResponse) return admin;

  const { id: targetId } = await ctx.params;

  if (targetId === admin.id) {
    return NextResponse.json({ error: "SELF" }, { status: 400 }); // AC-5.7
  }

  const [target] = await getDb().select({ email: user.email }).from(user).where(eq(user.id, targetId)).limit(1);
  if (!target) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const plannedExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // matches impersonationSessionDuration: 1800 in setup.ts

  const { id: auditLogId } = await writeAuditLog({
    action: "IMPERSONATION_START",
    adminUserId: admin.id,
    adminEmailSnapshot: admin.email,
    targetUserId: targetId,
    targetEmailSnapshot: target.email,
    detail: { plannedExpiresAt },
  });

  let pluginResponse: Response;
  try {
    pluginResponse = await auth.api.impersonateUser({
      headers: await headers(),
      body: { userId: targetId },
      asResponse: true,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "IMPERSONATION_FAILED", message: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  if (!pluginResponse.ok) {
    const body = await pluginResponse.json().catch(() => ({}));
    return NextResponse.json({ error: "IMPERSONATION_FAILED", ...body }, { status: pluginResponse.status });
  }

  const out = NextResponse.json({ ok: true, auditLogId }, { status: 200 });
  pluginResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") out.headers.append(key, value);
  });
  return out;
}
