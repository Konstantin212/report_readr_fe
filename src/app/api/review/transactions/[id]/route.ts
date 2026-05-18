import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import type { ManualReviewValues } from "@/lib/imports/persistence";
import { updateTransactionManualReview } from "@/lib/imports/persistence";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as ManualReviewValues;
  const updated = await updateTransactionManualReview({
    ownerUserId: user.id,
    transactionId: id,
    reviewerUserId: user.id,
    values: normalizeReviewValues(body),
  });

  if (!updated) {
    return NextResponse.json({ error: "Transaction was not found for this user." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

function normalizeReviewValues(values: ManualReviewValues): ManualReviewValues {
  return {
    amountEur: clean(values.amountEur),
    realizedPnlEur: clean(values.realizedPnlEur),
    feeEur: clean(values.feeEur),
    withholdingTaxEur: clean(values.withholdingTaxEur),
    cashAmountEur: clean(values.cashAmountEur),
    reviewNote: clean(values.reviewNote),
  };
}

function clean(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}
