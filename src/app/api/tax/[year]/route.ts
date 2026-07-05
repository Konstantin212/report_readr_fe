import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { getAvailableTaxYears, getTaxData } from "@/lib/data/tax";
import { taxResponseSchema } from "@/lib/api/contracts";
import { validatedJson } from "@/lib/api/validate";

export const maxDuration = 30;

/** Tax data for a year (+ the available-years list for the selector),
 *  fetched client-side via React Query so the tax page is cached across
 *  navigation. Owner-scoped via the session. */
export async function GET(_req: Request, ctx: { params: Promise<{ year: string }> }) {
  const u = await getCurrentUser();
  if (!u) return new NextResponse("unauthorized", { status: 401 });

  const { year } = await ctx.params;
  const yearNum = Number(year);
  if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) {
    return new NextResponse("bad year", { status: 400 });
  }

  const [tax, availableYears] = await Promise.all([
    getTaxData(u.id, yearNum),
    getAvailableTaxYears(u.id),
  ]);
  return validatedJson(taxResponseSchema, { tax, availableYears }, "GET /api/tax/[year]");
}
