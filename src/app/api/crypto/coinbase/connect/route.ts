import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/server";
import {
  COINBASE_SCOPES_USED,
  fetchCurrentUser,
  parseCredentialsBlob,
  CoinbaseAuthError,
} from "@/lib/crypto/coinbase";
import { insertCryptoAccount } from "@/lib/data/crypto-accounts";

/**
 * Connect a Coinbase CDP key. Body is the raw JSON blob the user pastes
 * from portal.cdp.coinbase.com — {name, privateKey}. We:
 *   1) require an authenticated user
 *   2) validate the blob shape
 *   3) verify the key works by calling /v2/user (rejects bad/expired keys
 *      before we ever persist anything)
 *   4) encrypt both halves and store
 *
 * The plaintext credentials live in memory only for the duration of this
 * handler. We never log them, never echo them back in the response.
 */

const Body = z.object({
  blob: z.string().min(50).max(5000),
  label: z.string().trim().max(80).optional(),
});

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u) return new NextResponse("unauthorized", { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  let credentials;
  try {
    credentials = parseCredentialsBlob(body.blob);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  let cbUser;
  try {
    cbUser = await fetchCurrentUser(credentials);
  } catch (e) {
    if (e instanceof CoinbaseAuthError) {
      return NextResponse.json({ error: "Coinbase rejected this key. Check that View permission is enabled." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not reach Coinbase. Try again in a moment." }, { status: 502 });
  }

  try {
    const row = await insertCryptoAccount({
      ownerUserId: u.id,
      exchange: "COINBASE",
      label: body.label ?? null,
      credentials,
      scopes: COINBASE_SCOPES_USED,
      exchangeUserId: cbUser.id,
    });
    return NextResponse.json({ account: row, coinbaseUser: { id: cbUser.id, email: cbUser.email } }, { status: 201 });
  } catch (e) {
    // Most likely cause: unique-constraint violation on (owner, exchange, exchange_user_id)
    const msg = (e as Error).message ?? "";
    if (msg.includes("crypto_accounts_owner_exchange_user_unique")) {
      return NextResponse.json({ error: "This Coinbase account is already connected." }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to save credentials." }, { status: 500 });
  }
}
