import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { CoinbaseAuthError } from "@/lib/crypto/coinbase";
import { recordSyncFailure, syncCoinbaseAccount } from "@/lib/crypto/sync";
import { getAccountWithCredentials } from "@/lib/data/crypto-accounts";

/**
 * Manual sync trigger for one Coinbase account. Owner-scoped: the
 * resolved cryptoAccount row must belong to the caller, otherwise we
 * return 404 (not 403, so an attacker can't probe for account ids).
 *
 * On Coinbase rejection (revoked key, wrong scope), we mark the account
 * status=invalid and surface the error to the UI; subsequent syncs are
 * skipped until the user reconnects.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return new NextResponse("unauthorized", { status: 401 });

  const { id } = await ctx.params;
  const fetched = await getAccountWithCredentials(u.id, id);
  if (!fetched) return new NextResponse("not found", { status: 404 });

  try {
    const result = await syncCoinbaseAccount({
      ownerUserId: u.id,
      cryptoAccountId: id,
      credentials: fetched.credentials,
      label: fetched.account.label,
      previousCursor: fetched.previousCursor,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    await recordSyncFailure(u.id, id, e);
    if (e instanceof CoinbaseAuthError) {
      return NextResponse.json(
        { error: "Coinbase rejected the key. Reconnect with a fresh CDP key." },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Sync failed. Try again later." }, { status: 500 });
  }
}
