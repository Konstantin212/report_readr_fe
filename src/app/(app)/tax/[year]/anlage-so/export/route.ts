import { requireCurrentUser } from "@/lib/auth/server";
import { buildAnlageSo } from "@/lib/tax/anlage-so";
import { renderAnlageSoCsv } from "@/lib/tax/export-csv-so";
import { renderAnlageSoPdf } from "@/lib/tax/export-pdf-so";

export async function GET(req: Request, ctx: { params: Promise<{ year: string }> }) {
  const user = await requireCurrentUser();
  const { year } = await ctx.params;
  const taxYear = Number(year);
  const format = new URL(req.url).searchParams.get("format") ?? "pdf";
  const draft = await buildAnlageSo(user.id, taxYear, user.name ?? null);
  if (format === "csv") {
    return new Response(renderAnlageSoCsv(draft), {
      headers: {
        "content-type": "text/csv",
        "content-disposition": `attachment; filename="anlage-so-${year}-evidence.csv"`,
      },
    });
  }
  const stream = await renderAnlageSoPdf(draft);
  return new Response(stream as never, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="anlage-so-${year}.pdf"`,
    },
  });
}
