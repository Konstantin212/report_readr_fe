import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { CoinbaseAuthError } from "@/lib/crypto/coinbase";
import { recordSyncFailure, syncCoinbaseAccount } from "@/lib/crypto/sync";
import { getAccountWithCredentials } from "@/lib/data/crypto-accounts";
import { checkRateLimit } from "@/lib/rate-limit";

// 14 Coinbase wallets × paginated /v2/accounts/:id/transactions + per-row
// DB upserts + lots rebuild — comfortably fits within Vercel's 300s
// Fluid-Compute ceiling but well above the 10-15s defaults that would
// otherwise time out on a first or recovery sync.
export const maxDuration = 120;

/**
 * Manual sync trigger for one Coinbase account. Owner-scoped: the
 * resolved cryptoAccount row must belong to the caller, otherwise we
 * return 404 (not 403, so an attacker can't probe for account ids).
 *
 * On Coinbase rejection (revoked key, wrong scope), we mark the account
 * status=invalid and surface the error to the UI; subsequent syncs are
 * skipped until the user reconnects.
 */
// 6 syncs per minute per (user, account). A typical full sync takes
// ~5-30s, so this lets a user retry a few times in a row but blocks a
// runaway client / compromised session from spamming Coinbase quota
// and Vercel function budget.
const SYNC_MAX_HITS = 6;
const SYNC_WINDOW_MS = 60_000;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return new NextResponse("unauthorized", { status: 401 });

  const { id } = await ctx.params;

  const limit = checkRateLimit(`crypto-sync:${u.id}:${id}`, SYNC_MAX_HITS, SYNC_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: `Rate limit hit; try again in ${limit.retryAfterSeconds}s.` },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

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
