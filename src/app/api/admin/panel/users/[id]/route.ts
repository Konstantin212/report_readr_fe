import { NextResponse } from "next/server";
import { z } from "zod";

import { requireAdminApi } from "@/lib/auth/require-admin";
import { deleteAdminUser, editAdminUser } from "@/lib/data/admin-mutations";
import { getDb } from "@/lib/db/client";

/**
 * AC-6 edit (PATCH) / AC-4 delete (DELETE) for a single admin-panel user.
 * `requireAdminApi()` first line of both handlers — the actual enforced
 * boundary for non-page requests (AC-2.2/2.5), verified by
 * tests/admin/route-guard-coverage.test.ts.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// §9: name/email/role are the only editable fields — id/signupAttemptId/
// createdAt/updatedAt are never in the allowed body shape at all
// (`.strict()` rejects unknown keys outright, matching AC-6.1's "no
// other fields accepted", not merely ignoring them).
const PatchBody = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    email: z
      .string()
      .trim()
      .min(3)
      .regex(EMAIL_RE, "Invalid email")
      .transform((s) => s.toLowerCase())
      .optional(),
    role: z.enum(["admin", "user"]).optional(),
  })
  .strict();

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  if (admin instanceof NextResponse) return admin;

  const { id: targetId } = await ctx.params;

  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
  }

  const db = getDb();
  const result = await editAdminUser(db, admin, targetId, body);

  if (!result.ok) {
    const status = result.reason === "NOT_FOUND" ? 404 : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }

  return NextResponse.json({ ok: true, auditLogFailed: result.auditLogFailed });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminApi();
  if (admin instanceof NextResponse) return admin;

  const { id: targetId } = await ctx.params;
  const db = getDb();
  const result = await deleteAdminUser(db, admin, targetId);

  if (!result.ok) {
    const status = result.reason === "NOT_FOUND" ? 404 : result.reason === "SELF" ? 400 : 409;
    return NextResponse.json({ error: result.reason }, { status });
  }

  return NextResponse.json({ ok: true, auditLogFailed: result.auditLogFailed });
}
