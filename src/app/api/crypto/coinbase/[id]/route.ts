import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { deleteCryptoAccount } from "@/lib/data/crypto-accounts";

/**
 * Revoke a Coinbase connection on our side. Deletes the encrypted
 * credentials row; we don't (and can't) revoke the CDP key on Coinbase's
 * side — that's a user-side action in portal.cdp.coinbase.com. The
 * Settings UI surfaces this caveat to the user.
 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return new NextResponse("unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const removed = await deleteCryptoAccount(u.id, id);
  if (removed === 0) return new NextResponse("not found", { status: 404 });
  return NextResponse.json({ deleted: removed });
}
