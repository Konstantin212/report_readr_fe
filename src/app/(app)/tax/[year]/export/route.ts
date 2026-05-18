import { requireCurrentUser } from "@/lib/auth/server";
import { buildAnlageKap } from "@/lib/tax/german-tax";
import { loadTaxInputs } from "@/lib/data/tax";
import { renderEvidenceCsv } from "@/lib/tax/export-csv";
import { renderKapPdf } from "@/lib/tax/export-pdf";

export async function GET(req: Request, ctx: { params: Promise<{ year: string }> }) {
  const user = await requireCurrentUser();
  const { year } = await ctx.params;
  const format = new URL(req.url).searchParams.get("format") ?? "pdf";
  const inputs = await loadTaxInputs(user.id, Number(year));
  const draft = buildAnlageKap(inputs);
  if (format === "csv") {
    return new Response(renderEvidenceCsv(draft), {
      headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="anlage-kap-${year}-evidence.csv"` },
    });
  }
  const stream = await renderKapPdf(draft);
  return new Response(stream as never, {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="anlage-kap-${year}.pdf"` },
  });
}
