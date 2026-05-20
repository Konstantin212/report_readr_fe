import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/server";
import { isAdminEmail } from "@/lib/auth/admin";
import { getDb } from "@/lib/db/client";
import { allowedEmails } from "@/lib/db/schema";

/**
 * Revoke a member's invitation. Deleting from `allowed_emails` does NOT
 * delete the existing `user` row — already-signed-in members keep their
 * data — it just prevents future sign-ins by that email.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return new NextResponse("unauthorized", { status: 401 });
  if (!isAdminEmail(u.email)) return new NextResponse("forbidden", { status: 403 });
  const { id } = await ctx.params;
  const deleted = await getDb()
    .delete(allowedEmails)
    .where(eq(allowedEmails.id, id))
    .returning({ id: allowedEmails.id });
  return NextResponse.json({ deleted: deleted.length });
}
