import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/server";
import { getPositionsData } from "@/lib/data/positions";
import { positionsDataSchema } from "@/lib/api/contracts";
import { validatedJson } from "@/lib/api/validate";

export const maxDuration = 30;

/** Positions list (no per-symbol detail). Consumed client-side by React
 *  Query so navigating away and back serves from cache instead of re-
 *  running the loader. Owner-scoped via the session. */
export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u) return new NextResponse("unauthorized", { status: 401 });

  const sp = new URL(req.url).searchParams;
  const brokerParam = sp.get("broker");
  const broker = brokerParam === "ff" || brokerParam === "ibkr" ? brokerParam : "all";
  const sector = sp.get("sector");

  const data = await getPositionsData(u.id, { broker, sector, symbol: null });
  return validatedJson(positionsDataSchema, data, "GET /api/positions");
}
