import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db/client";
import { userSettings } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * Save the user's approximate annual taxable income (zvE, EUR). Optional
 * setting — it only personalizes the Anlage KAP Zeile 4 Günstigerprüfung
 * recommendation (worthwhile iff the §32a marginal rate is below 25 %).
 * Body: { taxableIncomeEur: number | null } — null clears it.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { taxableIncomeEur?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const raw = body.taxableIncomeEur;
  let value: string | null;
  if (raw === null || raw === "" || raw === undefined) {
    value = null;
  } else {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 10_000_000) {
      return NextResponse.json({ error: "taxableIncomeEur must be a number between 0 and 10,000,000." }, { status: 422 });
    }
    value = String(Math.round(n));
  }

  const db = getDb();
  await db
    .insert(userSettings)
    .values({ ownerUserId: user.id, taxableIncomeEur: value })
    .onConflictDoUpdate({
      target: userSettings.ownerUserId,
      set: { taxableIncomeEur: value, updatedAt: new Date() },
    });

  return NextResponse.json({ taxableIncomeEur: value });
}
