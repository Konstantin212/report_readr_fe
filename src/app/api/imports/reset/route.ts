import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireCurrentUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db/client";
import {
  brokerAccounts,
  imports,
  lots,
  positions,
  realizedMatches,
  transactions,
} from "@/lib/db/schema";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await requireCurrentUser();
  let body: { brokerAccountId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const brokerAccountId = body.brokerAccountId;
  if (!brokerAccountId || typeof brokerAccountId !== "string") {
    return NextResponse.json({ error: "BROKER_ACCOUNT_ID_REQUIRED" }, { status: 400 });
  }

  const db = getDb();

  // Defensive: confirm the broker account belongs to the caller.
  const acct = await db
    .select()
    .from(brokerAccounts)
    .where(and(eq(brokerAccounts.id, brokerAccountId), eq(brokerAccounts.ownerUserId, user.id)));
  if (acct.length === 0) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  // Cascade order: transactions → lots → matches → positions → imports → broker_accounts
  await db
    .delete(transactions)
    .where(and(eq(transactions.brokerAccountId, brokerAccountId), eq(transactions.ownerUserId, user.id)));
  await db
    .delete(lots)
    .where(and(eq(lots.brokerAccountId, brokerAccountId), eq(lots.ownerUserId, user.id)));
  await db
    .delete(realizedMatches)
    .where(and(eq(realizedMatches.brokerAccountId, brokerAccountId), eq(realizedMatches.ownerUserId, user.id)));
  await db
    .delete(positions)
    .where(and(eq(positions.brokerAccountId, brokerAccountId), eq(positions.ownerUserId, user.id)));
  await db
    .delete(imports)
    .where(and(eq(imports.brokerAccountId, brokerAccountId), eq(imports.ownerUserId, user.id)));
  await db
    .delete(brokerAccounts)
    .where(and(eq(brokerAccounts.id, brokerAccountId), eq(brokerAccounts.ownerUserId, user.id)));

  return NextResponse.json({ ok: true });
}
