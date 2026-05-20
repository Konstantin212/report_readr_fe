import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/server";
import { isAdminEmail } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/client";
import { allowedEmails } from "@/lib/db/schema";

/**
 * Members management for the workspace allowlist.
 *
 *   GET    → list all currently allowed emails (admin only)
 *   POST   → { email, note? } → insert a new allowed email (admin only)
 *
 * Removal is handled by /api/admin/allowlist/[id].
 *
 * Admin gate: caller's email must match ADMIN_EMAILS in lib/auth/admin.ts.
 * Members can sign in but only the admin can invite or revoke others.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PostBody = z.object({
  email: z.string().min(3).regex(EMAIL_RE, "Invalid email").transform((s) => s.trim().toLowerCase()),
  note: z.string().trim().max(120).optional(),
});

async function requireAdmin(): Promise<{ id: string; email: string } | NextResponse> {
  const u = await getCurrentUser();
  if (!u) return new NextResponse("unauthorized", { status: 401 });
  if (!isAdminEmail(u.email)) return new NextResponse("forbidden", { status: 403 });
  return { id: u.id, email: u.email };
}

export async function GET() {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const rows = await getDb()
    .select()
    .from(allowedEmails)
    .orderBy(desc(allowedEmails.addedAt));
  return NextResponse.json({ rows });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  let body: z.infer<typeof PostBody>;
  try {
    body = PostBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  const db = getDb();
  // Idempotent: if the email is already there, return the existing row.
  const existing = await db.select().from(allowedEmails).where(eq(allowedEmails.email, body.email)).limit(1);
  if (existing.length) return NextResponse.json({ row: existing[0], existed: true });
  const inserted = await db
    .insert(allowedEmails)
    .values({ email: body.email, note: body.note, addedByUserId: admin.id })
    .returning();
  return NextResponse.json({ row: inserted[0], existed: false }, { status: 201 });
}
