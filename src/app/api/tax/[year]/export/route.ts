import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { getTaxDraft } from "@/lib/data/portfolio";
import { buildTaxEvidenceCsv, buildTaxEvidenceJson } from "@/lib/tax/export";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ year: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { year } = await params;
  const taxYear = Number(year);
  const format = new URL(request.url).searchParams.get("format") ?? "csv";
  const { draft } = await getTaxDraft(user.id, taxYear);

  if (format === "json") {
    return NextResponse.json(buildTaxEvidenceJson(draft), {
      headers: {
        "Content-Disposition": `attachment; filename="anlage-kap-${taxYear}-evidence.json"`,
      },
    });
  }

  return new NextResponse(buildTaxEvidenceCsv(draft), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="anlage-kap-${taxYear}-evidence.csv"`,
    },
  });
}
